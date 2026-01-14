from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import pandas as pd
import xgboost as xgb
import json
import os
import numpy as np

app = FastAPI(title="Retail Demand Forecasting API")

# need cors to let my frontend talk to backend
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # allowing all for now, should probably restrict this later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# global variables for storing loaded data
model = None
features_df = None
stats_df = None
history_df = None
feature_cols = []

# figuring out file paths relative to this script
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ARTIFACTS_DIR = os.path.join(BASE_DIR, "artifacts")
DATA_DIR = os.path.join(BASE_DIR, "..", "data", "processed")

@app.on_event("startup")
def load_assets():
    """loads everything when server starts"""
    global model, features_df, stats_df, history_df, feature_cols
    print("loading model and data...")
    
    # load xgboost model
    model = xgb.Booster()
    model.load_model(os.path.join(ARTIFACTS_DIR, "model.json"))
    
    # load uncertainty stats (standard deviations of residuals)
    stats_df = pd.read_csv(os.path.join(ARTIFACTS_DIR, "uncertainty_stats.csv"))
    
    # load features
    features_path = os.path.join(ARTIFACTS_DIR, "feature_store.csv")
    if os.path.exists(features_path):
        features_df = pd.read_csv(features_path)
    else:
        features_df = pd.read_csv(os.path.join(DATA_DIR, "walmart_features.csv"))
    
    features_df['Date'] = pd.to_datetime(features_df['Date'])
    
    # load feature names
    with open(os.path.join(ARTIFACTS_DIR, "model_features.json"), "r") as f:
        feature_cols = json.load(f)

    # load historical data for charts
    hist_path = os.path.join(DATA_DIR, "model_predictions_and_residuals.csv")
    if os.path.exists(hist_path):
        history_df = pd.read_csv(hist_path)
        history_df['Date'] = pd.to_datetime(history_df['Date'])
    
    print("loaded successfully")

@app.get("/")
def health_check():
    return {"status": "active"}

@app.get("/stores")
def get_stores():
    """returns list of stores"""
    stores = sorted(features_df['Store'].unique().tolist())
    return {"stores": stores}

@app.get("/stores/{store_id}/depts")
def get_depts(store_id: int):
    """returns departments for a store"""
    depts = sorted(features_df[features_df['Store'] == store_id]['Dept'].unique().tolist())
    return {"depts": depts}

class ForecastRequest(BaseModel):
    store_id: int
    dept_id: int
    date: str

@app.post("/forecast")
def predict_forecast(req: ForecastRequest):
    """makes a forecast for given store/dept/date"""
    
    target_date = pd.to_datetime(req.date)
    
    # finding the row with matching store, dept, date
    row = features_df[
        (features_df['Store'] == req.store_id) & 
        (features_df['Dept'] == req.dept_id) & 
        (features_df['Date'] == target_date)
    ]
    
    if row.empty:
        raise HTTPException(status_code=404, detail="no data for this date")
    
    # getting features ready
    X = row[feature_cols].copy()
    
    # converting categorical to numeric (Type column)
    if 'Type' in X.columns and X['Type'].dtype == 'object':
        type_map = {'A':0, 'B':1, 'C':2}
        X['Type'] = X['Type'].map(type_map)
         
    if 'IsHoliday' in X.columns and X['IsHoliday'].dtype == 'bool':
        X['IsHoliday'] = X['IsHoliday'].astype(int)
        
    # making prediction
    dmatrix = xgb.DMatrix(X)
    pred_mean = float(model.predict(dmatrix)[0])
    
    # getting standard deviation for this store-dept
    unc_row = stats_df[(stats_df['Store'] == req.store_id) & (stats_df['Dept'] == req.dept_id)]
    if not unc_row.empty:
        std = float(unc_row['residual_std'].iloc[0])
    else:
        std = float(stats_df['residual_std'].mean())  # fallback to average
    
    # calculating confidence intervals using 1.65 for 95% confidence
    lower = max(0, pred_mean - 1.65 * std)
    upper = pred_mean + 1.65 * std
    
    return {
        "store": req.store_id,
        "dept": req.dept_id,
        "date": req.date,
        "forecast_mean": round(pred_mean, 2),
        "forecast_std": round(std, 2),
        "forecast_lower": round(lower, 2),
        "forecast_upper": round(upper, 2)
    }

class InventoryRequest(BaseModel):
    mean_forecast: float
    std_forecast: float
    lead_time: int = 2
    service_level_z: float = 1.65  # 95% service level

@app.post("/inventory")
def calculate_inventory(req: InventoryRequest):
    """calculates safety stock and reorder quantity"""
    
    # safety stock formula from lecture notes
    safety_stock = req.service_level_z * req.std_forecast * np.sqrt(req.lead_time)
    
    # reorder qty = expected demand during lead time + safety stock
    reorder_qty = (req.mean_forecast * req.lead_time) + safety_stock
    
    return {
        "safety_stock": round(safety_stock, 2),
        "reorder_qty": round(reorder_qty, 2),
        "lead_time_demand": round(req.mean_forecast * req.lead_time, 2)
    }

@app.get("/history")
def get_history(store_id: int, dept_id: int):
    """returns historical sales and predictions"""
    if history_df is None:
        raise HTTPException(status_code=500, detail="history not available")
        
    subset = history_df[
        (history_df['Store'] == store_id) & 
        (history_df['Dept'] == dept_id)
    ].sort_values('Date')
    
    # converting to json
    data = []
    for _, row in subset.iterrows():
        item = {
            "date": row['Date'].strftime('%Y-%m-%d'),
            "actual": row['Weekly_Sales'],
            "forecast": row['Pred_XGBoost'] if 'Pred_XGBoost' in row else None
        }
        data.append(item)
        
    return data

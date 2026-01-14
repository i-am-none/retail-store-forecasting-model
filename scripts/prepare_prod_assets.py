import pandas as pd
import xgboost as xgb
import os
import numpy as np

# creating the artifacts folder 
os.makedirs("backend/artifacts", exist_ok=True)

print("loading data...")

# getting the uncertainty stats from my previous model results
# this tells me how much my predictions were off by for each store-dept combo
df_res = pd.read_csv("data/processed/model_predictions_and_residuals.csv")
stats = df_res.groupby(['Store', 'Dept'])['Residual_XGBoost'].std().reset_index()
stats.columns = ['Store', 'Dept', 'residual_std']
# filling any missing values with the average (some stores might not have enough data)
stats['residual_std'] = stats['residual_std'].fillna(stats['residual_std'].mean())
stats.to_csv("backend/artifacts/uncertainty_stats.csv", index=False)
print(f"saved uncertainty stats for {len(stats)} combinations")

# copying the features file to artifacts folder so my api can access it
df = pd.read_csv("data/processed/walmart_features.csv")
df['Date'] = pd.to_datetime(df['Date'])
df.to_csv("backend/artifacts/feature_store.csv", index=False)
print("saved features")

# training the xgboost model now
print("training model...")
train_df = df[df['Weekly_Sales'].notnull()].copy()

# need to convert Type column to numbers (A/B/C -> 0/1/2)
if 'Type' in train_df.columns:
    if train_df['Type'].dtype == 'object':
        train_df['Type'] = train_df['Type'].astype('category').cat.codes

# convert holiday boolean to int
if 'IsHoliday' in train_df.columns:
    train_df['IsHoliday'] = train_df['IsHoliday'].astype(int)

# selecting features - everything except date and the target variable
exclude_cols = ['Date', 'Weekly_Sales'] 
feature_cols = [c for c in train_df.columns if c not in exclude_cols]

print(f"using {len(feature_cols)} features")

X = train_df[feature_cols]
y = train_df['Weekly_Sales']

# training xgboost with default params mostly
# tried different values but 100 trees seems to work fine
model = xgb.XGBRegressor(
    objective='reg:squarederror',
    n_estimators=100,
    learning_rate=0.1,
    max_depth=6
)
model.fit(X, y)

model.save_model("backend/artifacts/model.json")
print("model saved!")

# also saving which features i used so the api knows what to expect
import json
with open("backend/artifacts/model_features.json", "w") as f:
    json.dump(feature_cols, f)
print("done!")

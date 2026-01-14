@echo off
echo Starting Retail Demand Forecasting Dashboard

start cmd /k "title Backend && cd backend && uvicorn main:app --reload --port 8000"
timeout /t 5
start cmd /k "title Frontend && cd frontend && npm run dev"

echo System starting... Access frontend at http://localhost:3000

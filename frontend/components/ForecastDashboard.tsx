"use client";

import { useState, useEffect } from "react";
import { fetchStores, fetchDepts, fetchHistory, fetchForecast, fetchInventory } from "@/lib/api";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from 'recharts';
import { Activity, Package, TrendingUp, AlertTriangle } from 'lucide-react';
import { motion } from "framer-motion";

export default function ForecastDashboard() {
    // state for dropdown selections
    const [stores, setStores] = useState<number[]>([]);
    const [depts, setDepts] = useState<number[]>([]);
    const [selectedStore, setSelectedStore] = useState<number>(1);
    const [selectedDept, setSelectedDept] = useState<number>(1);
    const [history, setHistory] = useState<any[]>([]);

    const [forecast, setForecast] = useState<any>(null);
    const [inventory, setInventory] = useState<any>(null);
    const [targetDate, setTargetDate] = useState<string>("2012-10-26");

    const [loading, setLoading] = useState(false);

    // fetching stores on page load
    useEffect(() => {
        fetchStores().then(data => {
            if (data.stores) setStores(data.stores);
        }).catch(console.error);
    }, []);

    // when store changes, get its departments
    useEffect(() => {
        if (selectedStore) {
            fetchDepts(selectedStore).then(data => {
                if (data.depts) setDepts(data.depts);
            }).catch(console.error);
        }
    }, [selectedStore]);

    // getting history and running forecast when selection changes
    useEffect(() => {
        if (selectedStore && selectedDept) {
            setLoading(true);
            fetchHistory(selectedStore, selectedDept).then(data => {
                setHistory(data);
                if (data.length > 0) {
                    // using most recent date we have
                    const lastDate = data[data.length - 1].date;
                    setTargetDate(lastDate);
                    runForecast(selectedStore, selectedDept, lastDate);
                }
            }).finally(() => setLoading(false));
        }
    }, [selectedStore, selectedDept]);

    const runForecast = async (s: number, d: number, date: string) => {
        try {
            const f = await fetchForecast(s, d, date);
            setForecast(f);
            const i = await fetchInventory(f.forecast_mean, f.forecast_std);
            setInventory(i);
        } catch (e) {
            console.error("forecast failed", e);
        }
    };

    // showing last year of data
    const chartData = history.slice(-52).map(h => ({
        date: h.date,
        actual: h.actual,
        forecast: h.forecast
    }));

    return (
        <div className="p-6 space-y-8 min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30">

            <header className="flex justify-between items-center border-b border-slate-800 pb-6">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                        Retail Demand Forecast
                    </h1>
                    <p className="text-slate-400 text-sm">weekly sales predictions</p>
                </div>
                <div className="flex gap-4">
                    <div className="flex flex-col">
                        <label className="text-xs text-slate-500 mb-1">Store</label>
                        <select
                            className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none min-w-[100px]"
                            value={selectedStore}
                            onChange={(e) => setSelectedStore(Number(e.target.value))}
                        >
                            {stores.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div className="flex flex-col">
                        <label className="text-xs text-slate-500 mb-1">Department</label>
                        <select
                            className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm min-w-[100px]"
                            value={selectedDept}
                            onChange={(e) => setSelectedDept(Number(e.target.value))}
                        >
                            {depts.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                </div>
            </header>

            {/* metrics cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard
                    title="Forecast"
                    value={forecast ? `$${forecast.forecast_mean.toLocaleString()}` : "--"}
                    sub={`±$${forecast?.forecast_std?.toLocaleString() ?? 0}`}
                    icon={<TrendingUp className="text-emerald-400" />}
                    delay={0.1}
                />
                <StatCard
                    title="Safety Stock"
                    value={inventory ? inventory.safety_stock.toLocaleString() : "--"}
                    sub="buffer inventory"
                    icon={<AlertTriangle className="text-amber-400" />}
                    delay={0.2}
                />
                <StatCard
                    title="Reorder Quantity"
                    value={inventory ? inventory.reorder_qty.toLocaleString() : "--"}
                    sub="recommended order"
                    icon={<Package className="text-blue-400" />}
                    delay={0.3}
                />
                <StatCard
                    title="Confidence"
                    value="95%"
                    sub="prediction confidence"
                    icon={<Activity className="text-purple-400" />}
                    delay={0.4}
                />
            </div>

            {/* main chart */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 shadow-2xl"
            >
                <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-emerald-500" />
                    Sales Forecast Over Time
                </h3>
                <div className="h-[400px] w-full">
                    <ResponsiveContainer>
                        <ComposedChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis
                                dataKey="date"
                                stroke="#64748b"
                                tick={{ fill: '#64748b', fontSize: 12 }}
                                tickFormatter={(v) => v.substring(0, 7)}
                            />
                            <YAxis
                                stroke="#64748b"
                                tick={{ fill: '#64748b', fontSize: 12 }}
                                tickFormatter={(v) => `$${v / 1000}k`}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }}
                                itemStyle={{ color: '#e2e8f0' }}
                            />
                            <Legend />
                            <Line
                                type="monotone"
                                dataKey="actual"
                                stroke="#10b981"
                                strokeWidth={2}
                                name="Actual Sales"
                                dot={false}
                                activeDot={{ r: 6 }}
                            />
                            <Line
                                type="monotone"
                                dataKey="forecast"
                                stroke="#6366f1"
                                strokeDasharray="4 4"
                                strokeWidth={2}
                                name="Model Forecast"
                                dot={false}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </motion.div>

            {/* info cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-emerald-500/5 group-hover:bg-emerald-500/10 transition-colors"></div>
                    <h4 className="font-semibold text-lg mb-4 text-emerald-400 relative z-10">model details</h4>
                    <div className="space-y-4 text-sm text-slate-400 relative z-10">
                        <div className="flex justify-between border-b border-slate-800 pb-2">
                            <span>predicted sales:</span>
                            <span className="text-slate-200">${forecast?.forecast_mean.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-800 pb-2">
                            <span>std deviation:</span>
                            <span className="text-slate-200">${forecast?.forecast_std.toLocaleString()}</span>
                        </div>
                        <div className="pt-2">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-slate-300">safety stock calc</span>
                            </div>
                            <code className="block bg-black/30 p-2 rounded text-xs font-mono text-emerald-300">
                                1.65 × {Math.round(forecast?.forecast_std ?? 0)} × √2 = {inventory?.safety_stock.toLocaleString()}
                            </code>
                        </div>
                    </div>
                </div>
                <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800 relative overflow-hidden">
                    <div className="absolute inset-0 bg-blue-500/5"></div>
                    <h4 className="font-semibold text-lg mb-4 text-blue-400 relative z-10">status</h4>
                    <div className="flex items-center justify-center h-32 flex-col gap-2 relative z-10">
                        <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-emerald-400 text-sm font-medium">model running</span>
                        <span className="text-slate-500 text-xs">predictions for {stores.length} stores</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, sub, icon, delay }: any) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay }}
            className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-lg relative overflow-hidden hover:border-slate-700 transition-colors"
        >
            <div className="absolute -right-4 -top-4 opacity-5 transform scale-150">
                {icon}
            </div>
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-slate-800/50 text-emerald-400">
                    {icon}
                </div>
                <h3 className="text-slate-400 text-sm font-medium tracking-wide uppercase">{title}</h3>
            </div>
            <div className="text-2xl font-bold text-white mb-1 tracking-tight">
                {value}
            </div>
            <div className="text-xs font-medium text-slate-500 flex items-center gap-1">
                {sub}
            </div>
        </motion.div>
    )
}

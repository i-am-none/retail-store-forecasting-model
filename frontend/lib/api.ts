const API_URL = "http://localhost:8000";

export const fetchStores = async () => {
    try {
        const res = await fetch(`${API_URL}/stores`);
        if (!res.ok) throw new Error("API not ready");
        return res.json();
    } catch (e) {
        console.error(e);
        return { stores: [] };
    }
};

export const fetchDepts = async (storeId: number) => {
    const res = await fetch(`${API_URL}/stores/${storeId}/depts`);
    return res.json();
};

export const fetchForecast = async (storeId: number, deptId: number, date: string) => {
    const res = await fetch(`${API_URL}/forecast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: storeId, dept_id: deptId, date }),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "failed to get forecast");
    }
    return res.json();
};

export const fetchInventory = async (mean: number, std: number) => {
    const res = await fetch(`${API_URL}/inventory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            mean_forecast: mean,
            std_forecast: std,
        }),
    });
    return res.json();
};

export const fetchHistory = async (storeId: number, deptId: number) => {
    const res = await fetch(`${API_URL}/history?store_id=${storeId}&dept_id=${deptId}`);
    if (!res.ok) return [];
    return res.json();
};

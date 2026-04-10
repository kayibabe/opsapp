
import numpy as np

def simple_forecast(series):
    if len(series) < 3:
        return []
    x = np.arange(len(series))
    y = np.array(series)
    coeffs = np.polyfit(x, y, 1)
    trend = np.poly1d(coeffs)
    return trend(np.arange(len(series), len(series)+3)).tolist()

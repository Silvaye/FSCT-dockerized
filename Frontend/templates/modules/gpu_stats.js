export function startGpuStatsPolling(updateCallback, interval = 500) {
    function fetchGpuStats() {
      fetch('/gpu_stats')
        .then(resp => resp.json())
        .then(data => updateCallback(data))
        .catch(err => updateCallback(null, err));
    }
    fetchGpuStats();
    return setInterval(fetchGpuStats, interval);
  }
  
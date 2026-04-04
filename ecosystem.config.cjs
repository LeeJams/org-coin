module.exports = {
  apps: [
    {
      name: "dry-run-manager",
      cwd: __dirname,
      script: "dist/src/cli/run-dry-run-service.js",
      interpreter: "node",
      autorestart: true,
      restart_delay: 5000,
      kill_timeout: 10000,
      max_memory_restart: "512M",
      merge_logs: true,
      time: true,
      out_file: "./var/log/pm2/dry-run-manager.out.log",
      error_file: "./var/log/pm2/dry-run-manager.err.log",
      env: {
        TRADING_MODE: "dry_run",
        ENABLE_LIVE_EXECUTION: "false",
        DRY_RUN_ENTRY_PROFILE: "v1",
        DRY_RUN_LOOP_INTERVAL_SECONDS: "300",
        DRY_RUN_LOG_DIR: "var/log/dry-run-service",
        DRY_RUN_CYCLE_LOG_FILE: "cycles.ndjson",
      },
    },
  ],
};

module.exports = {
  apps: [{
    name: 'globalcare-backend',
    script: 'server.js',
    instances: '2',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 5050
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    merge_logs: true,
    max_memory_restart: '2G',
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s',
    listen_timeout: 3000,
    kill_timeout: 5000,
  }]
};

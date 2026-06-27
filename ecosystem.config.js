module.exports = {
  apps: [
    {
      name: "dingtou-monitor",
      script: "./app/server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "256M",
      env: {
        NODE_ENV: "production",
        PORT: 8788,
        DCA_HOST: "127.0.0.1",
        DCA_DATA_DIR: "./cloud-data",
        DCA_PUBLIC_HEALTH: "true",
      },
    },
  ],
};

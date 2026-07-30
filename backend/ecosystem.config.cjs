module.exports = {
  apps: [
    {
      name: "tzairdrop-api",
      cwd: "/opt/thomzone-airdrop/backend",
      script: "./dist/src/index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "tzairdrop-worker",
      cwd: "/opt/thomzone-airdrop/backend",
      script: "./dist/src/worker.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
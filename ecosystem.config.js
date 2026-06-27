module.exports = {
  apps: [
    {
      name: "bolzoy-back",
      script: "server.js",
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 9000,
      },
    },
  ],
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externals = Array.isArray(config.externals) ? config.externals : [];
      config.externals = [
        ...externals,
        ({ request }, callback) => {
          if (request === "node:sqlite") return callback(null, `commonjs ${request}`);
          callback();
        },
      ];
    }
    return config;
  },
};

export default nextConfig;

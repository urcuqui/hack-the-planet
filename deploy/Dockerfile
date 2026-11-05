# HACK THE PLANET — static game server (tools/serve.js, no npm dependencies).
FROM node:22-alpine

WORKDIR /app

# Only what the server needs: pages, game modules, images and the server itself.
COPY package.json index.html level1.html level2.html level3.html level4.html ./
COPY js ./js
COPY tools/serve.js ./tools/serve.js

ENV HOST=0.0.0.0 \
    PORT=8080 \
    NODE_ENV=production

USER node
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "tools/serve.js"]

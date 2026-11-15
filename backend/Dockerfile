# syntax=docker/dockerfile:1

FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
# Optional native dependencies differ between the Windows development host and
# this Linux container. `npm install` resolves the Linux variant in-container;
# `npm ci` rejects a lock generated on the other platform before it can do so.
RUN npm install

COPY . .

# sets process.env.PORT
ENV PORT=3000 
ENV NODE_ENV=development

# documents that the container listens on port 3000
EXPOSE 3000

# Run as the image's unprivileged "node" user rather than root, so a compromised server cannot change the image.
USER node

CMD ["npm", "run", "dev"]

# ~~~~~ Base ~~~~~
FROM node:20-alpine AS base

RUN apk add --no-cache curl g++ make python3 py3-pip tini

# Uncomment the below to use PNPM
# RUN curl -L https://unpkg.com/@pnpm/self-installer | node

WORKDIR /usr/src/app

COPY --chown=node:node . /usr/src/app/

# ~~~~~ Build ~~~~~
FROM base AS build

RUN npm install

RUN npm run build

RUN npm prune --omit=dev --silent

# ~~~~~ Release ~~~~~
FROM base AS release

COPY --from=build /usr/src/app/ /usr/src/app/

USER node

EXPOSE 3000

CMD [ "tini", "--", "npm", "start" ]

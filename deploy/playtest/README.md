# Playtest server

The built game and the relay on one port, so friends on different networks play together before
Steam networking exists ([0012](../../docs/decisions/0012-playtest-server.md)). The code is
`apps/relay`; this folder builds and runs it.

## Build the image

From the repo root, on any machine with Docker:

```bash
docker build -f deploy/playtest/Dockerfile --build-arg BUILD=$(git rev-parse --short HEAD) -t stillwake-playtest:latest .
```

To get it onto the server without a registry:

```bash
docker save stillwake-playtest:latest | ssh <server> docker load
```

## Run it

- **Behind a Cloudflare Tunnel** (as on the toss-it.org VPS): add a public hostname to the tunnel,
  `stillwake.toss-it.org` to `http://localhost:8080`; copy `compose.tunnel.yml` to the server, put
  `PLAYTEST_PASSWORD=...` into an `.env` beside it, then `docker compose -f compose.tunnel.yml up -d`.
  The tunnel gives the name and HTTPS, and passes the relay's WebSocket as it is.
- **Behind Traefik** (the network `web`, a `letsencrypt` resolver): copy `compose.yml` to the server,
  put `DOMAIN=stillwake.example.com` and `PLAYTEST_PASSWORD=...` into an `.env` beside it, then
  `docker compose up -d`.
- **Behind nginx or Caddy:** run the container with `-p 127.0.0.1:8080:8080 -e PLAYTEST_PASSWORD=...`
  and proxy the domain to it. The relay is a WebSocket at `/relay`: nginx needs
  `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";` and a long
  `proxy_read_timeout`; Caddy's `reverse_proxy` handles it as is.

The domain needs a DNS record pointing at the server, and HTTPS: browsers ask the password on every
page, and send it in the clear without it.

## Play

The host opens `https://<domain>/?host=<name>` (letters, digits and dashes) and enters the password,
with any user name. Friends open `https://<domain>/?join=<name>`. A named session keeps its links
through an update; a bare `?host` is numbered instead, as the dev panel (`` ` ``) shows:
`hosting ?join=N`. The build is in the bottom-right corner of every page, for screenshots.

## Update

Build the image again, load it on the server, and `docker compose up -d`. The restart ends running
sessions; within half a minute every open page offers to reload into the new build (`version.json`
beside the page says which is out). A host's page saves its world first and loads it back after the
reload, unless the new build cannot read that save.

## Settings

| Variable            | Default     | Meaning                                                 |
| ------------------- | ----------- | ------------------------------------------------------- |
| `PORT`              | `8080`      | where the server listens in the container               |
| `GAME_DIR`          | `/app/game` | the built game it serves                                |
| `PLAYTEST_PASSWORD` | none        | asked of every page and socket; without it, open to all |

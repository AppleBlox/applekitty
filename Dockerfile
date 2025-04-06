FROM oven/bun:latest

RUN apt-get update &&
    apt-get install -y libfontconfig1 libfontconfig1-dev

RUN bun install

CMD ["bun", "run","--bun" "start"]

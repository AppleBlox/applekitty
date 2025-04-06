FROM oven/bun:latest

# Install dependencies
RUN apt-get update && \
    apt-get install -y libfontconfig1 libfontconfig1-dev

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./

# Install dependencies
RUN bun install

# Copy the rest of the application
COPY . .

# Start the application
CMD ["bun", "run", "start"]
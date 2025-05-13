# Use the official Bun image
FROM oven/bun:slim

# Set the working directory
WORKDIR /app

# Copy dependencies first
COPY bun.lock package.json ./

# Install dependencies (use --no-save to skip writing bun.lockb)
RUN bun install

# Copy the rest of the app
COPY . .

# Expose the app port (adjust if using a different one)
EXPOSE 3000

# Start the server
CMD ["bun", "run", "index.js"]
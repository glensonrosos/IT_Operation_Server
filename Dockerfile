# Use an official Node runtime as a parent image
#FROM node:18.17.1-buster
FROM node:22-bookworm-slim
# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install --no-audit --no-fund

# Copy the app's source code into the container
COPY . .

# Specify the port the app runs on
EXPOSE 5011

# Command to run your application
CMD ["npm", "start"]
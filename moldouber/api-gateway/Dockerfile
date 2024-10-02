# Use Python 3.9 as the base image
FROM python:3.9-slim

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy the requirements.txt to install dependencies
COPY requirements.txt ./

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application files (including app.py and any other Python files)
COPY . .

# Expose port 5000 for the Flask API Gateway
EXPOSE 5000

# Command to run the Flask app
CMD ["python", "app.py"]

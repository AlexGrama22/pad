# service-discovery/Dockerfile

FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY service-discovery.py service-discovery.py

EXPOSE 8500

CMD ["python", "service-discovery.py"]

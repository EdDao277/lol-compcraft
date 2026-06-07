FROM python:3.11-slim

ENV HOST=0.0.0.0
ENV PORT=8787
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-ml-api.txt .
RUN pip install --no-cache-dir -r requirements-ml-api.txt

COPY server ./server
COPY scripts ./scripts

EXPOSE 8787

CMD ["python", "server/app.py"]

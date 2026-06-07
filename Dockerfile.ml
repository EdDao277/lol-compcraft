FROM python:3.11-slim

ENV HOST=0.0.0.0
ENV PORT=8787
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements-ml.txt .
RUN pip install --no-cache-dir -r requirements-ml.txt

COPY server ./server
COPY scripts ./scripts

EXPOSE 8787

CMD ["python", "server/app.py"]

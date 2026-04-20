# API Reference

An interactive OpenAPI/Swagger explorer is available at <http://localhost:3000/api/docs> when the service is running. This file summarizes the same surface for quick reference.

## Authentication

Protected endpoints require an API key passed via the `x-api-key` header:

```
x-api-key: <your-api-key>
```

Set the key in `.env` as `API_KEY`. Minimum 16 characters recommended.

## Endpoints

### Charts

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/charts/generate` | yes | Generate and store a new chart |
| `GET` | `/api/charts/:hash` | no | Chart metadata (JSON) |
| `GET` | `/api/charts/:hash/png` | no | Chart as PNG image |
| `GET` | `/api/charts/:hash/embed` | no | Embeddable HTML snippet |
| `GET` | `/api/charts/:hash/json` | no | Full chart data as JSON |
| `PUT` | `/api/charts/:hash` | yes | Update chart |
| `DELETE` | `/api/charts/:hash` | yes | Delete chart |

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Basic liveness check |
| `GET` | `/api/health/detailed` | Detailed status including DB/Redis |

## Examples

### Generate a chart

```bash
curl -X POST http://localhost:3000/api/charts/generate \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "title": "Sales Report",
    "description": "Monthly sales data",
    "chartType": "bar",
    "data": {
      "labels": ["Jan", "Feb", "Mar"],
      "datasets": [{
        "label": "Sales",
        "data": [100, 200, 150]
      }]
    },
    "width": 800,
    "height": 600,
    "theme": "light",
    "isPublic": true
  }'
```

### Access a chart

```bash
# Metadata
curl http://localhost:3000/api/charts/{chart-hash}

# PNG
curl http://localhost:3000/api/charts/{chart-hash}/png --output chart.png

# Embed HTML
curl http://localhost:3000/api/charts/{chart-hash}/embed
```

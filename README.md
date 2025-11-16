# Chart Service

A high-performance microservice for generating, storing, and serving interactive charts using Chart.js and Node.js.

## Tech Stack

- **Backend**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL
- **Caching**: Redis (optional)
- **Chart Generation**: Chart.js + Puppeteer (for PNG exports)
- **Authentication**: API Key (x-api-key header)
- **Documentation**: Swagger/OpenAPI
- **Containerization**: Podman with multi-stage builds (Docker compatible)
- **Security**: Helmet, CORS, Rate Limiting

## Features

- Generate interactive charts with various types (bar, line, pie, etc.)
- Store chart configurations and data
- Export charts as PNG images
- Embed charts in external websites
- RESTful API with comprehensive documentation
- API Key authentication (x-api-key header)
- Redis caching for improved performance
- Podman support for easy deployment (Docker compatible)

## Quick Start

### Using Podman Compose (Recommended)

1. Clone the repository:

    ```bash
    git clone <repository-url>
    cd chart-service
    ```

2. Start all services:

    ```bash
    podman-compose up -d
    ```

This will start:

- PostgreSQL database on port 5433
- Redis cache on port 6380
- Chart Service API on port 3000

### Manual Installation

1. Install dependencies:

    ```bash
    npm install
    ```

2. Set up environment variables:

    ```bash
    cp .env.example .env
    # Edit .env with your configuration
    ```

3. Start PostgreSQL and Redis (required):

    ```bash
    # Using Podman
    podman run -d --name postgres -e POSTGRES_DB=chart_service -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=password -p 5433:5432 postgres:15-alpine

    podman run -d --name redis -p 6380:6379 redis:7-alpine
    ```

4. Build and run the application:

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## API Documentation

Once the service is running, you can access:

- **API Documentation**: `http://localhost:3000/api/docs`
- **Health Check**: `http://localhost:3000/api/health`
- **API Root**: `http://localhost:3000/`

### Main API Endpoints

#### Charts

- `POST /api/charts/generate` - Generate a new chart (requires authentication)
- `GET /api/charts/:hash` - Get chart information
- `GET /api/charts/:hash/png` - Get chart as PNG image
- `GET /api/charts/:hash/embed` - Get embeddable HTML
- `GET /api/charts/:hash/json` - Get chart data as JSON
- `PUT /api/charts/:hash` - Update chart (requires authentication)
- `DELETE /api/charts/:hash` - Delete chart (requires authentication)

#### Health

- `GET /api/health` - Basic health check
- `GET /api/health/detailed` - Detailed health information


## Authentication

The API uses API Key authentication. To access protected endpoints:

1. Include your API key in the `x-api-key` header:

  `x-api-key: your-api-key`

2. Set the `API_KEY` environment variable in your `.env` file.

## Environment Variables

Key environment variables (see `.env.example` for complete list):

- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port (default: 3000)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` - Database configuration
- `REDIS_URL` - Redis connection URL
- `BEARER_TOKEN` - Authentication token
- `ALLOWED_ORIGINS` - CORS allowed origins
- `LOG_LEVEL` - Logging level

## Podman Deployment

### Build Podman Image

```bash
podman build -t chart-service .
```

### Run with Podman

```bash
podman run -p 3000:3000 \
  -e DB_HOST=your-db-host \
  -e DB_PASSWORD=your-db-password \
  -e BEARER_TOKEN=your-secret-token \
  chart-service
```

### Using Podman Compose

```bash
podman-compose up -d
```

### Docker Compatibility

This project is also compatible with Docker. If you prefer to use Docker instead of Podman, simply replace `podman` commands with `docker` and `podman-compose` with `docker-compose`.

## Development

### Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm test` - Run tests
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix linting issues
- `npm run podman:build` - Build Podman image
- `npm run podman:run` - Run Podman container
- `npm run podman:compose:up` - Start services with Podman Compose
- `npm run podman:compose:down` - Stop services with Podman Compose
- `npm run docker:build` - Build Docker image (for Docker users)
- `npm run docker:run` - Run Docker container (for Docker users)

### Project Structure

```bash
src/
├── config/          # Configuration files
├── middleware/      # Express middleware
├── routes/          # API routes
├── services/        # Business logic services
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
└── index.ts         # Application entry point

public/
└── js/              # Client-side JavaScript for charts
```

## Chart Usage Examples

### Generate a Chart

```bash
curl -X POST http://localhost:3000/api/charts/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
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

### Access a Chart

```bash
# Get chart info
curl http://localhost:3000/api/charts/{chart-hash}

# Get PNG image
curl http://localhost:3000/api/charts/{chart-hash}/png --output chart.png

# Get embed HTML
curl http://localhost:3000/api/charts/{chart-hash}/embed
```

## License

MIT

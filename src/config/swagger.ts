import swaggerJSDoc from 'swagger-jsdoc';
import { env } from './env';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'RawChart API',
    version: '1.0.0',
    description: 'A microservice for generating, storing, and serving interactive charts',
  },
  servers: [
    {
      url: `http://${env.HOST}:${env.PORT}`,
      description: 'Development server',
    }
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'Provide your API key in the x-api-key header.'
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false,
          },
          error: {
            type: 'string',
            example: 'Error message',
          },
        },
      },
      ChartData: {
        type: 'object',
        properties: {
          labels: {
            type: 'array',
            items: {
              type: 'string',
            },
            example: ['January', 'February', 'March'],
          },
          datasets: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: {
                  type: 'string',
                  example: 'Sales',
                },
                data: {
                  type: 'array',
                  items: {
                    type: 'number',
                  },
                  example: [10, 20, 30],
                },
                backgroundColor: {
                  oneOf: [
                    { type: 'string' },
                    {
                      type: 'array',
                      items: { type: 'string' }
                    }
                  ],
                  example: 'rgba(75, 192, 192, 0.2)',
                },
                borderColor: {
                  oneOf: [
                    { type: 'string' },
                    {
                      type: 'array',
                      items: { type: 'string' }
                    }
                  ],
                  example: 'rgba(75, 192, 192, 1)',
                },
                borderWidth: {
                  type: 'number',
                  example: 1,
                },
                fill: {
                  type: 'boolean',
                },
                type: {
                  type: 'string',
                  enum: ['line', 'bar'],
                },
              },
            },
          },
        },
      },
      GenerateChartRequest: {
        type: 'object',
        required: ['chartType', 'data'],
        properties: {
          title: {
            type: 'string',
            example: 'Monthly Sales Report',
          },
          description: {
            type: 'string',
            example: 'Sales data for the current month',
          },
          chartType: {
            type: 'string',
            enum: ['line', 'bar', 'pie', 'doughnut', 'radar', 'polarArea', 'scatter', 'bubble', 'mixed'],
            example: 'bar',
          },
          data: {
            $ref: '#/components/schemas/ChartData',
          },
          width: {
            type: 'number',
            example: 800,
          },
          height: {
            type: 'number',
            example: 600,
          },
          theme: {
            type: 'string',
            enum: ['light', 'dark', 'custom'],
            example: 'light',
          },
          isPublic: {
            type: 'boolean',
            example: false,
          },
          expiresAt: {
            type: 'string',
            format: 'date-time',
            example: '2025-12-31T23:59:59Z',
          },
          chartConfig: {
            $ref: '#/components/schemas/ChartConfig',
          },
        },
      },
      ChartResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true,
          },
          data: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                format: 'uuid',
                example: '123e4567-e89b-12d3-a456-426614174000',
              },
              chart_hash: {
                type: 'string',
                example: 'abc123def456789abc123def456789ab',
              },
              title: {
                type: 'string',
                example: 'Monthly Sales Report',
              },
              description: {
                type: 'string',
                example: 'Sales data for the current month',
              },
              chart_type: {
                type: 'string',
                example: 'bar',
              },
              width: {
                type: 'number',
                example: 800,
              },
              height: {
                type: 'number',
                example: 600,
              },
              theme: {
                type: 'string',
                enum: ['light', 'dark'],
                example: 'light',
              },
              is_public: {
                type: 'boolean',
                example: false,
              },
              expires_at: {
                type: 'string',
                format: 'date-time',
                nullable: true,
                example: null,
              },
              created_at: {
                type: 'string',
                format: 'date-time',
                example: '2025-10-18T21:00:00Z',
              },
              updated_at: {
                type: 'string',
                format: 'date-time',
                example: '2025-10-18T21:00:00Z',
              },
              access_url: {
                type: 'string',
                example: 'http://localhost:3000/api/charts/abc123def456789abc123def456789ab',
              },
              embed_url: {
                type: 'string',
                example: 'http://localhost:3000/api/charts/abc123def456789abc123def456789ab/embed',
              },
              png_url: {
                type: 'string',
                example: 'http://localhost:3000/api/charts/abc123def456789abc123def456789ab/png',
              },
              json_url: {
                type: 'string',
                example: 'http://localhost:3000/api/charts/abc123def456789abc123def456789ab/json',
              },
            },
          },
        },
      },
      ChartConfig: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['line', 'bar', 'pie', 'doughnut', 'radar', 'polarArea', 'scatter', 'bubble', 'mixed'],
            example: 'bar',
          },
          options: {
            type: 'object',
            properties: {
              responsive: {
                type: 'boolean',
                example: true,
              },
              maintainAspectRatio: {
                type: 'boolean',
                example: false,
              },
              plugins: {
                type: 'object',
                properties: {
                  legend: {
                    type: 'object',
                    properties: {
                      display: {
                        type: 'boolean',
                        example: true,
                      },
                      position: {
                        type: 'string',
                        enum: ['top', 'bottom', 'left', 'right'],
                        example: 'top',
                      },
                    },
                  },
                  title: {
                    type: 'object',
                    properties: {
                      display: {
                        type: 'boolean',
                        example: true,
                      },
                      text: {
                        type: 'string',
                        example: 'Sales Report',
                      },
                    },
                  },
                },
              },
              scales: {
                type: 'object',
              },
              elements: {
                type: 'object',
              },
            },
          },
        },
      },
    },
  },
};

const options = {
  swaggerDefinition,
  apis: [
    './dist/routes/*.js',
    './dist/index.js',
  ],
};

export const swaggerSpec = swaggerJSDoc(options);
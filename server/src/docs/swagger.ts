import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Codeyoung Trial Class Booking API',
      version: '1.0.0',
      description:
        'RESTful API for booking trial coding classes with Indian mentors (Asia/Kolkata) across US, UK, and European timezones.',
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Local development server',
      },
    ],
    components: {
      schemas: {
        Booking: {
          type: 'object',
          properties: {
            bookingRef: { type: 'string', example: 'BK-AB12CD' },
            parentName: { type: 'string', example: 'Sarah Jenkins' },
            parentEmail: { type: 'string', example: 'sarah.j@example.com' },
            parentTimezone: { type: 'string', example: 'America/New_York' },
            childName: { type: 'string', example: 'Leo Jenkins' },
            childAge: { type: 'number', example: 10 },
            slotStartUtc: { type: 'string', format: 'date-time' },
            slotEndUtc: { type: 'string', format: 'date-time' },
            meetingLink: { type: 'string', example: 'https://meet.google.com/xyz-codeyoung-demo' },
            status: { type: 'string', enum: ['CONFIRMED', 'CANCELLED'] },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: { type: 'object' },
                alternatives: { type: 'array', items: { type: 'object' } },
              },
            },
          },
        },
      },
    },
    paths: {
      '/api/health': {
        get: {
          summary: 'Health check',
          responses: {
            200: { description: 'API is healthy' },
          },
        },
      },
      '/api/timezones/suggested': {
        get: {
          summary: 'Suggested timezones grouped by region',
          responses: {
            200: { description: 'Timezone options' },
          },
        },
      },
      '/api/slots': {
        get: {
          summary: 'Get available slots for a parent date & timezone',
          parameters: [
            { name: 'date', in: 'query', required: true, schema: { type: 'string', example: '2026-10-15' } },
            { name: 'tz', in: 'query', required: true, schema: { type: 'string', example: 'America/New_York' } },
          ],
          responses: {
            200: { description: 'Available slots list with IST conversion' },
            400: { description: 'Invalid timezone or date' },
          },
        },
      },
      '/api/bookings': {
        post: {
          summary: 'Create a new trial booking',
          headers: {
            'Idempotency-Key': { schema: { type: 'string' }, description: 'Unique idempotency key' },
          },
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['parentName', 'parentEmail', 'parentTimezone', 'slotStartUtc'],
                  properties: {
                    parentName: { type: 'string' },
                    parentEmail: { type: 'string' },
                    parentTimezone: { type: 'string' },
                    slotStartUtc: { type: 'string', format: 'date-time' },
                    childName: { type: 'string' },
                    childAge: { type: 'number' },
                    notes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Booking created' },
            400: { description: 'Validation failed or slot too soon' },
            409: { description: 'Slot unavailable or mentor capacity reached' },
          },
        },
      },
      '/api/bookings/{bookingRef}': {
        get: {
          summary: 'Get booking details by reference code',
          parameters: [{ name: 'bookingRef', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Booking found' },
            404: { description: 'Booking not found' },
          },
        },
        delete: {
          summary: 'Cancel booking and release mentor capacity',
          parameters: [{ name: 'bookingRef', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Booking cancelled' },
            404: { description: 'Booking not found' },
          },
        },
      },
      '/api/mentors': {
        get: {
          summary: 'List all active mentors',
          responses: {
            200: { description: 'Mentors list' },
          },
        },
      },
      '/api/mentors/{id}/schedule': {
        get: {
          summary: 'Get mentor schedule and daily load count',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'date', in: 'query', schema: { type: 'string', example: '2026-10-15' } },
          ],
          responses: {
            200: { description: 'Mentor schedule and daily load' },
          },
        },
      },
    },
  },
  apis: [],
};

export const swaggerSpec = swaggerJsdoc(options);

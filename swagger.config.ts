import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('LabConnect API')
    .setDescription(
      'Laboratory Information System API - Comprehensive REST API for managing laboratory operations including patient registration, test orders, sample tracking, result management, and analyzer integration.'
    )
    .setVersion('2.0.0')
    .addTag('Authentication', 'User authentication and authorization endpoints')
    .addTag('Users', 'User management endpoints')
    .addTag('Patients', 'Patient registration and management')
    .addTag('Orders', 'Test order management')
    .addTag('Samples', 'Sample collection and tracking')
    .addTag('Results', 'Test result entry and verification')
    .addTag('Test Catalog', 'Laboratory test catalog management')
    .addTag('Test Panels', 'Test panel management')
    .addTag('Machines', 'Analyzer machine management')
    .addTag('QC', 'Quality control sample and result management')
    .addTag('HL7', 'HL7/ASTM message processing and communication logs')
    .addTag('Audit', 'Audit log viewing')
    .addTag('Reports', 'Statistical reports and analytics')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth'
    )
    .addServer('http://localhost:3000', 'Local Development')
    .addServer('https://api.labconnect.com', 'Production')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'LabConnect API Documentation',
    customfavIcon: '/favicon.ico',
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info { margin: 50px 0 }
      .swagger-ui .info .title { font-size: 36px }
    `,
  });
}

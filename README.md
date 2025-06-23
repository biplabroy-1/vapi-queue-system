# VAPI Queue System

## Overview

A queueing system for managing VAPI (Voice API) calls with scheduling capabilities.

## Features

- Queue calls for automated execution
- Schedule different AI assistants based on day and time
- Track call status and analytics

## Schedule Configuration

The system supports configuring different assistant types and personas for different time slots throughout the week:

### Time Slots

- **Morning**: 9am-11am
- **Afternoon**: 1pm-3pm
- **Evening**: 6pm-8pm

### Default Weekly Schedule

| Day/Time  | 9am-11am            | 1pm-3pm                   | 6pm-8pm                   |
| --------- | ------------------- | ------------------------- | ------------------------- |
| Sunday    | Solar (Olivia)      | Vehicle Management (Doug) | Airbnb (Avery)            |
| Monday    | AI Business (Paige) | Airbnb (Avery)            | Vehicle Management (Doug) |
| Tuesday   | AI Business (Paige) | Vehicle Management (Doug) | Solar (Olivia)            |
| Wednesday | AI Business (Paige) | Airbnb (Avery)            | Airbnb (Avery)            |
| Thursday  | AI Business (Paige) | Vehicle Management (Doug) | Vehicle Management (Doug) |
| Friday    | Airbnb (Avery)      | Airbnb (Avery)            | Solar (Olivia)            |
| Saturday  | Solar (Olivia)      | Vehicle Management (Doug) | Airbnb (Avery)            |

## API Endpoints

### Queue Management

- `POST /queue-calls` - Add contacts to the call queue
- `POST /start-queue` - Start processing the call queue
- `GET /queue-status/:clerkId` - Get queue status for a user

### Schedule Management

- `GET /schedule/:clerkId` - Get the current schedule configuration
- `GET /schedule/default` - Get the default schedule configuration
- `POST /schedule` - Set or update schedule configuration

## Environment Variables

- `MONGODB_URI` - MongoDB connection string
- `VAPI_API_KEY` - API key for VAPI
- `ASSISTANT_ID_SOLAR` - VAPI assistant ID for Solar persona
- `ASSISTANT_ID_AI_BUSINESS` - VAPI assistant ID for AI Business persona
- `ASSISTANT_ID_VEHICLE_MGMT` - VAPI assistant ID for Vehicle Management persona
- `ASSISTANT_ID_AIRBNB` - VAPI assistant ID for Airbnb persona

## Usage

See API documentation for detailed request and response formats.

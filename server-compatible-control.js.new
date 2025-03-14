#!/usr/bin/env node

const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const os = require('os');
const { execFile } = require('child_process');
const WebSocketClient = require('./websocket-client');

// Generate a unique client ID
const clientId = `MaxBot-WebCP-${uuidv4().substring(0, 8)}`;
// Create a PID file
const pidFile = path.join(__dirname, 'maxbot-webcp-control.pid');
console.log(`MaxBot WebCP HTTP Control started on http://localhost:${PORT}`);
console.log('MaxBot WebCP HTTP Control started');

// Initialize application state
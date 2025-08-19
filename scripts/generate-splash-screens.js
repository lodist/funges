#!/usr/bin/env node

/**
 * Generate splash screen images for PWA
 * This script creates splash screen images for different device sizes
 * using the existing logo as a base.
 *
 * Requirements:
 * - Node.js with Canvas support
 * - Run: npm install canvas
 */

import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define splash screen sizes for different devices
const splashSizes = [
  // iPhone sizes
  { width: 375, height: 667, name: 'splash-375x667.png' },
  { width: 414, height: 736, name: 'splash-414x736.png' },
  { width: 375, height: 812, name: 'splash-375x812.png' },
  { width: 414, height: 896, name: 'splash-414x896.png' },
  { width: 414, height: 896, name: 'splash-414x896-3x.png' }, // 3x density

  // iPad sizes
  { width: 768, height: 1024, name: 'splash-768x1024.png' },
  { width: 834, height: 1112, name: 'splash-834x1112.png' },
  { width: 834, height: 1194, name: 'splash-834x1194.png' },
  { width: 1024, height: 1366, name: 'splash-1024x1366.png' },

  // Android sizes
  { width: 360, height: 640, name: 'splash-360x640.png' },
  { width: 412, height: 732, name: 'splash-412x732.png' },
  { width: 412, height: 915, name: 'splash-412x915.png' },

  // Desktop sizes
  { width: 1280, height: 720, name: 'splash-1280x720.png' },
  { width: 1920, height: 1080, name: 'splash-1920x1080.png' },
];

async function generateSplashScreens() {
  try {
    console.debug('🎨 Generating PWA splash screen images...');

    // Create splash screens directory if it doesn't exist
    const splashDir = path.join(__dirname, '..', 'public', 'splash-screens');
    if (!fs.existsSync(splashDir)) {
      fs.mkdirSync(splashDir, { recursive: true });
    }

    // Load the logo image
    const logoPath = path.join(
      __dirname,
      '..',
      'public',
      'icons',
      'logo_app.png'
    );
    if (!fs.existsSync(logoPath)) {
      console.error('❌ Logo file not found:', logoPath);
      console.debug('💡 Please ensure the logo file exists at:', logoPath);
      return;
    }

    const logo = await loadImage(logoPath);

    // Generate splash screen for each size
    for (const size of splashSizes) {
      const canvas = createCanvas(size.width, size.height);
      const ctx = canvas.getContext('2d');

      // Create gradient background
      const gradient = ctx.createLinearGradient(0, 0, size.width, size.height);
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(1, '#f8fafc');

      // Fill background
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size.width, size.height);

      // Calculate logo size (about 20% of screen width)
      const logoSize = Math.min(size.width, size.height) * 0.2;
      const logoX = (size.width - logoSize) / 2;
      const logoY = (size.height - logoSize) / 2 - logoSize * 0.5; // Slightly above center

      // Draw logo
      ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);

      // Save the image
      const outputPath = path.join(splashDir, size.name);
      const buffer = canvas.toBuffer('image/png');
      fs.writeFileSync(outputPath, buffer);

      console.debug(
        `✅ Generated: ${size.name} (${size.width}x${size.height})`
      );
    }

    console.debug('🎉 All splash screen images generated successfully!');
    console.debug(`📁 Output directory: ${splashDir}`);
    console.debug(
      '💡 Add these images to your PWA manifest and HTML meta tags'
    );
  } catch (error) {
    console.error('❌ Error generating splash screens:', error.message);
    console.debug(
      '💡 Make sure you have the canvas package installed: npm install canvas'
    );
  }
}

// Run the script
generateSplashScreens();

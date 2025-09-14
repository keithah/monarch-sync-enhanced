WARNING!! this does not work today. I am trying to add other integrations, eventually I will circle back. don't use it. I will archive it for now.

<div align="center">
<img src="public/icon-128.png" alt="logo"/>
<h1>Enhanced Monarch Sync</h1>
</div>

## What is this?

A Chrome extension to sync purchases from multiple retailers with [Monarch Money](https://monarchmoney.com) transactions. This project extends the concept of Amazon purchase syncing to support multiple major retailers.

## Inspiration

This project is forked from and inspired by [monarch-amazon-sync](https://github.com/alex-peck/monarch-amazon-sync) by Alex Peck. The original project provided an excellent foundation for Amazon transaction syncing, which we've expanded to support multiple retailers.

## Supported Retailers

- ✅ **Amazon** - Full support (inherited from original project)
- 🚧 **Home Depot** - Basic integration (order detection works, product extraction needs improvement)
- 📋 **Planned**: eBay, Best Buy, IKEA, Walmart

## Features

- Automatically matches retailer orders with Monarch transactions based on amounts and dates
- Populates Monarch transaction notes with item names and per-item prices
- Handles refunds and returns
- Supports gift card transactions
- Daily sync for new orders
- Backfill support for historical orders
- Multi-retailer support with unified interface

## Installation

> [!WARNING]
> This should be considered BETA software. Test carefully and backup your Monarch transactions before use!

1. Download the latest release zip from the releases page
2. Unzip the file
3. Open Chrome and navigate to `chrome://extensions`
4. Enable developer mode
5. Click "Load unpacked" and select the unzipped folder

## How to use

1. Make sure you are logged in to your retailer accounts (Amazon, Home Depot, etc.)
2. Open Monarch in your browser to allow the extension to grab necessary API keys
3. Configure which retailers to sync in the extension popup
4. Use "Force sync" to manually sync purchases or enable daily automatic syncing

## Current Status & Known Issues

- **Amazon**: Fully functional (original codebase)
- **Home Depot**: Order detection and amount matching works, but product name extraction from individual order detail pages needs improvement
- Transaction matching works correctly across all supported retailers

## Contributing

See the [Issues](../../issues) page for current development priorities and known bugs. PRs welcome!

## Built With

Based on [chrome-extension-boilerplate-react-vite](https://github.com/Jonghakseo/chrome-extension-boilerplate-react-vite)

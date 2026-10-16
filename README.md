# Media Finder

An Umbraco backoffice dashboard that lets you search for media items by name, size, or type.

## Features
- Search media by file name
- Search media by file size range
- Search media by file type / extension
- Results displayed in a table with file name, size, and a link to the media item

## Compatibility
- Umbraco 13, 14, 15, 16, 17
- .NET 8.0
- .NET 9.0
- .NET 10.0

## Installation
- Install via NuGet https://www.nuget.org/packages/DigitalWonderlab.MediaFinder/latest
- Go to Settings and click the Media Finder tab

## Telemetry
Once a day Media Finder sends us a small anonymous report so we know how many sites use it and on which
versions. It is on by default and easy to turn off.

- **Sent:** a random install ID (created on first run, stored in your Umbraco database, not derived from anything
  about your site), the package, Umbraco and .NET versions, environment type, hosting type, database type, the media library's rough size in bands such as `100-999`, and how many searches were run in the last day (banded).
- **Never sent:** hostnames, URLs, file or item names, content, user names, emails or IP addresses.
- **See it / turn it off:** the dashboard's **Settings** tab shows exactly what is sent and has an on/off switch.
  Or set `"MediaFinder": { "Telemetry": { "Enabled": false } }`, or `"DigitalWonderlab": { "Telemetry": { "Enabled": false } }`
  for every Digital Wonderlab package.
- Local development (`ASPNETCORE_ENVIRONMENT=Development`) never sends anything. Data is kept for 13 months.

## Issues / Suggestions
- To report an issue or suggest a feature please use the GitHub issue tracker - https://github.com/dwlkev/DigitalWonderlab.MediaFinder/issues

## Screenshots
![Dashboard](https://i.postimg.cc/W3PYjn83/medafinder.png)

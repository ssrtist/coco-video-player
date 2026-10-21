# Sing & Dance Video Player (`dance.cocogames.org`) Infrastructure & Architecture

This document describes the cloud edge topology, Zero Trust access security, DNS routing, and application streaming architecture for **Coco Sing & Dance** ([https://dance.cocogames.org](https://dance.cocogames.org)).

---

## 1. Global End-to-End System Diagram

```mermaid
flowchart TD
    subgraph Clients["Authorized User Devices"]
        Desktop["Desktop Browsers (Chrome / Edge / Firefox)"]
        Mobile["Mobile & Tablet Devices (iOS / Android)"]
    end

    subgraph Cloudflare_Edge["Cloudflare Edge Tier (cocogames.org)"]
        CF_DNS["Cloudflare DNS\ndance.cocogames.org\n(CNAME -> cname.vercel-dns.com, Proxied: true)"]
        CF_Access["Cloudflare Zero Trust Access Gatekeeper\n- App: 'Coco Dance'\n- Default-Deny Security Model\n- Session Cookie: CF_Authorization"]
        CF_Policy["Access Policy: Family Access\n- Rule: Action = Allow\n- Selector: Emails = [ssrtist@gmail.com, ...]"]
    end

    subgraph Auth_Tier["Identity & Authentication Providers"]
        Google_OAuth["Google Cloud OAuth 2.0 / IdP\n- Client ID & Secret Verification\n- One-Time PIN Fallback (Email OTP)"]
    end

    subgraph Frontend_Tier["Frontend Edge Tier (Vercel)"]
        Vercel_SSL["Automated Let's Encrypt TLS / SSL"]
        Vercel_Project["Vercel Project: coco-dance-app\n- Entry Point: index.html\n- UI: TailwindCSS / HTML5 / JS\n- IndexedDB Audio Recording Engine\n- .vercelignore: Excludes heavy video files"]
    end

    subgraph Storage_Tier["Object Storage & Media Streaming (Cloudflare R2)"]
        R2_Bucket["R2 Bucket: 'coco-dance-videos'\n- Region: ENAM\n- Unlimited Free Egress ($0 Bandwidth Fees)"]
        R2_Endpoint["Public Streaming CDN Endpoint:\npub-18aec1f30ae442ebbfbee0cf65c7fc41.r2.dev"]
        R2_Media["11 MP4 Video Files (~818 MB Total)\n- Zumba 30-Min (194 MB)\n- Classic 2-Mile (182 MB)\n- Super Coaches Walk (119 MB)\n- Coco Dance with Yooki (84 MB)\n- Personal TS Clips & Sing-Alongs"]
    end

    subgraph Local_Homelab["Local Homelab Fallback Tier"]
        TrueNAS_SCALE["TrueNAS SCALE Server (192.168.3.5:30040)\n- Path: /dance/ on WordPress Container\n- Subnet Restricted (.htaccess: 192.168.3.0/24)"]
    end

    %% Network flows
    Clients -->|1. Request https://dance.cocogames.org| CF_DNS
    CF_DNS -->|2. Intercept at Edge| CF_Access
    CF_Access <-->|3. Challenge & Verify Identity| Google_OAuth
    CF_Access -->|4. If Authorized: Pass to Destination| Frontend_Tier
    Frontend_Tier --> Vercel_Project

    %% Media fetching
    Vercel_Project -->|5. Load HTML/CSS/JS UI| Clients
    Clients -->|6. Stream Video Payloads via HTTP Range Requests| R2_Endpoint
    R2_Endpoint --> R2_Bucket
    R2_Bucket --> R2_Media

    %% Fallback
    Clients -.->|Local Subnet Fallback Only| TrueNAS_SCALE
```

---

## 2. Ingress, Security & Routing Specifications

| Component | Target / Value | Configuration | Functionality |
| :--- | :--- | :--- | :--- |
| **Public URL** | `https://dance.cocogames.org` | Canonical FQDN | Protected family edutainment video player |
| **DNS Record** | `cname.vercel-dns.com` | `CNAME`, `proxied: true` | Routes traffic through Cloudflare Edge Anycast IPs |
| **Zero Trust App** | `Coco Dance` | Self-Hosted Application | Edge authentication interception before Vercel or media load |
| **Access Policy** | `Family Access` | `Action: Allow`, `Selector: Emails` | Email allowlist validation (`ssrtist@gmail.com`, etc.) |
| **Frontend Host** | Vercel (`coco-dance-app`) | Static Edge Deployment | Serves HTML5 interface, lyrics synchronization, IndexedDB recorder |
| **Video Storage** | Cloudflare R2 (`coco-dance-videos`) | `Standard`, `ENAM` | High-throughput byte-range video streaming with $0 egress fees |
| **Local Fallback** | `http://192.168.3.5:30040/dance/` | Apache / TrueNAS SCALE | Subnet-fenced local server for offline/LAN use |

---

## 3. Storage Architecture: 11 Hosted Video Payloads

| Video Title | Cloudflare R2 Filename | Size | Resolution |
| :--- | :--- | :---: | :---: |
| Zumba 30-Minute Mini-Workout | `Zumba 30-Minute Mini-Workout_720p.mp4` | 194.0 MB | 720p |
| Classic 2 Mile Workout | `Classic 2 Mile Workout_720p.mp4` | 181.8 MB | 720p |
| Walking Exercise with SUPER Coaches | `Walking Exercise with the SUPER Coaches_720p.mp4` | 119.4 MB | 720p |
| Coco Dance with Yooki | `Coco Dance App 2 of 2 - Dance.mp4` | 84.3 MB | 1080p |
| Let It Be (Personal Clip) | `PXL_20250514_193032889.TS.mp4` | 52.0 MB | 1080p |
| My Bonnie (Personal Clip) | `PXL_20250528_190856971.TS.mp4` | 42.7 MB | 1080p |
| Brave (Personal Clip) | `PXL_20250625_194342335.TS.mp4` | 40.2 MB | 1080p |
| True Colors (Personal Clip) | `PXL_20250528_194505329.TS.mp4` | 38.8 MB | 1080p |
| I Can See Clearly Now | `I Can See Clearly Now_720p.mp4` | 31.9 MB | 720p |
| My Bonnie Lies Over The Ocean | `My Bonnie Lies Over The Ocean_1080p.mp4` | 25.9 MB | 1080p |
| Golden Girls Theme | `Golden Girls_720p.mp4` | 7.6 MB | 720p |
| **Total Media Size** | **11 Video Files** | **~818.5 MB** | **Streaming from R2** |

---

## 4. Operational Maintenance & Deployments

1. **Deploy Frontend Code Changes**:
   ```powershell
   python C:\Users\kenny\.gemini\skills\vercel\scripts\vercel_client.py deploy "C:\working\git-repos\coco-video-player" --project coco-dance-app --prod
   ```
2. **Push Upstream Repository**:
   ```powershell
   git -C "C:\working\git-repos\coco-video-player" push origin main
   ```
3. **Add New Videos**:
   - Upload new MP4 files to Cloudflare R2 bucket `coco-dance-videos`.
   - Update `videoData` in `index.html` referencing `https://pub-18aec1f30ae442ebbfbee0cf65c7fc41.r2.dev/<filename>.mp4`.
   - Run the deploy script above.

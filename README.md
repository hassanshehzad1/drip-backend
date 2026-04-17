# 👗 Drip — Fashion Reels Backend API

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?style=for-the-badge&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-4.x-010101?style=for-the-badge&logo=socket.io&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-Auth-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)
![Stripe](https://img.shields.io/badge/Stripe-Payments-635BFF?style=for-the-badge&logo=stripe&logoColor=white)

**A production-grade REST API for a Fashion & Outfits Reels platform.**  
Think Zomato meets TikTok — but for fashion.

[API Docs](#api-endpoints) • [Setup](#getting-started) • [Features](#features) • [Architecture](#architecture)

</div>

---

## 📌 What is Drip?

Drip is a full-featured fashion discovery platform where users browse short outfit reels, shop directly from videos, follow fashion brands, and get AI-powered style recommendations. This repository contains the complete backend API.

---

## ✨ Features

### 👤 Authentication
- Separate auth for Users, Fashion Partners, and Admins
- JWT access tokens (15 min) + HTTP-only refresh tokens (7 days)
- Role-based access control (RBAC)
- Refresh token rotation with reuse detection

### 🎬 Outfit Reels
- Video upload via ImageKit CDN
- Paginated vertical feed with filters
- View count tracking (fire-and-forget)
- Discount percentage virtual fields

### 🛍️ Shopping
- Cart with price locking at add time
- Stripe payment integration
- COD (Cash on Delivery) support
- Order lifecycle management
- Outfit snapshot for deleted item history

### ❤️ Social Features
- Like / Unlike outfits (toggle)
- Bookmark / Save looks
- Follow / Unfollow fashion partners
- Nested comments (1 level deep)
- Share outfits in chat

### 🔍 Search & Discovery
- Full-text search with MongoDB text index
- Filter by category, price range, size, partner
- 6 sort options (newest, popular, trending, price)
- Auto-complete suggestions
- Trending tags with scoring algorithm

### 🤖 AI Recommendations
- Content-based filtering (no external AI needed)
- User categoryScores updated on every interaction
- 6-factor scoring: category match, followed partners, tag overlap, direct preference, trending, freshness
- Style quiz for cold-start new users
- "Complete the Look" cross-selling
- Trending outfits by engagement score

### 🔔 Notifications
- Real-time via Socket.io
- Persisted in MongoDB for offline users
- 11 notification types (like, comment, follow, order, etc.)
- Unread count, mark as read, bulk operations

### 💬 Real-time Chat
- User ↔ Partner direct messaging
- Outfit sharing in chat
- Read receipts
- Typing indicators
- Soft delete with "This message was deleted"
- Consistent conversationId (sorted ID pair)

### 🛡️ Admin Panel
- Superadmin + Moderator roles with permissions
- Partner approval workflow
- Content moderation (outfits, comments)
- User ban/unban
- Platform analytics with aggregation pipeline

### 🔒 Security
- Helmet security headers
- CORS whitelist
- Rate limiting (different limits per route)
- MongoDB injection sanitization
- HPP (HTTP Parameter Pollution) prevention
- XSS escape on text fields
- Environment validation at startup
- Bcrypt password hashing (salt rounds: 12)

---

## 🏗️ Architecture

```
drip-backend/
├── server.js                    # HTTP server + Socket.io
├── app.js                       # Express app + middleware
├── config/
│   ├── db.js                    # MongoDB connection
│   ├── imagekit.js              # ImageKit CDN init
│   ├── logger.js                # Winston logger
│   ├── socket.js                # Socket.io config + rooms
│   └── security.js              # CORS, Helmet, env validation
├── models/                      # 13 Mongoose models
│   ├── User.js
│   ├── FashionPartner.js
│   ├── OutfitItem.js
│   ├── Like.js / Bookmark.js / Follow.js / Comment.js
│   ├── Cart.js / Order.js
│   ├── Notification.js / Message.js
│   └── Admin.js
├── routes/                      # 13 route files
├── controllers/                 # 13 controller files
├── middleware/
│   ├── authUser.middleware.js
│   ├── authPartner.middleware.js
│   ├── authAdmin.middleware.js
│   ├── upload.middleware.js
│   ├── error.middleware.js
│   ├── validate.middleware.js
│   └── rateLimit.middleware.js
├── services/
│   ├── imagekit.service.js
│   ├── stripe.service.js
│   ├── socket.service.js        # Notification helpers
│   └── ai.service.js            # Scoring algorithms
├── utils/
│   ├── AppError.js
│   ├── catchAsync.js
│   ├── sendResponse.js
│   ├── pagination.js
│   └── constants.js
└── scripts/
    └── seedAdmin.js
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- MongoDB Atlas account (free tier works)
- ImageKit account (free tier works)
- Stripe account (test mode)

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/drip-backend.git
cd drip-backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```

### Environment Variables

```env
# Server
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

# Database
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/drip-db

# JWT
JWT_SECRET=your_super_secret_jwt_key_minimum_32_characters
JWT_REFRESH_SECRET=your_refresh_secret_different_from_above
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ImageKit (imagekit.io)
IMAGEKIT_PUBLIC_KEY=your_public_key
IMAGEKIT_PRIVATE_KEY=your_private_key
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your_id

# Stripe (stripe.com)
STRIPE_SECRET_KEY=sk_test_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Admin Seed
ADMIN_EMAIL=admin@drip.com
ADMIN_PASSWORD=Admin@123456
```

### Run the App

```bash
# Development
npm run dev

# Production
npm start

# Seed admin account (run once)
npm run seed:admin
```

### Expected Startup Output

```
✅ Environment variables validated
✅ JWT secrets are strong and different
✅ MongoDB connected: cluster.mongodb.net
✅ Socket.io initialized successfully
🚀 Server running in development mode on port 5000
💡 Health check: http://localhost:5000/api/health
```

---

## 📡 API Endpoints

### Health Check
```
GET /api/health
```

### Authentication (Users)
```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout
GET    /api/auth/me
PATCH  /api/auth/update-profile
PATCH  /api/auth/change-password
```

### Partner Auth
```
POST   /api/partner/auth/register
POST   /api/partner/auth/login
POST   /api/partner/auth/refresh
POST   /api/partner/auth/logout
GET    /api/partner/me
PATCH  /api/partner/update-profile
PATCH  /api/partner/change-password
GET    /api/partner/:partnerId
```

### File Upload
```
POST   /api/upload/image        (partner)
POST   /api/upload/video        (partner)
POST   /api/upload/avatar       (user)
DELETE /api/upload/:fileId
```

### Outfits
```
GET    /api/outfit/feed
GET    /api/outfit/my-outfits   (partner)
GET    /api/outfit/partner/:partnerId
GET    /api/outfit/:id
POST   /api/outfit              (partner)
PATCH  /api/outfit/:id          (partner)
PATCH  /api/outfit/:id/featured (partner)
DELETE /api/outfit/:id          (partner)
```

### Social
```
POST   /api/social/like/:outfitId
GET    /api/social/liked
POST   /api/social/bookmark/:outfitId
GET    /api/social/bookmarks
POST   /api/social/follow/:partnerId
GET    /api/social/following
GET    /api/social/partner/followers
GET    /api/social/follow/check/:partnerId
POST   /api/social/comment/:outfitId
POST   /api/social/comment/:commentId/reply
GET    /api/social/comment/:outfitId
GET    /api/social/comment/:commentId/replies
DELETE /api/social/comment/:commentId
GET    /api/social/status/:outfitId
```

### Search
```
GET    /api/search
GET    /api/search/trending
GET    /api/search/partners
GET    /api/search/suggestions
GET    /api/search/category/:category
GET    /api/search/personalized
```

### Cart
```
GET    /api/cart
POST   /api/cart/add
PATCH  /api/cart/item/:itemId
DELETE /api/cart/item/:itemId
DELETE /api/cart/clear
```

### Orders
```
POST   /api/order/checkout
POST   /api/order/webhook          (Stripe)
GET    /api/order/my-orders
GET    /api/order/partner-orders   (partner)
GET    /api/order/partner-stats    (partner)
GET    /api/order/:orderId
PATCH  /api/order/:orderId/status  (partner)
PATCH  /api/order/:orderId/cancel
```

### Notifications
```
GET    /api/notification
GET    /api/notification/unread-count
PATCH  /api/notification/read-all
DELETE /api/notification/read
PATCH  /api/notification/:id/read
DELETE /api/notification/:id
```

### Chat
```
GET    /api/chat/conversations
GET    /api/chat/unread-count
GET    /api/chat/:otherPartyId
POST   /api/chat/:otherPartyId
GET    /api/chat/:otherPartyId/search
DELETE /api/chat/message/:messageId
```

### AI Recommendations
```
GET    /api/ai/feed
GET    /api/ai/style-analysis
GET    /api/ai/trending
GET    /api/ai/recommended-partners
GET    /api/ai/similar/:outfitId
GET    /api/ai/complete-look/:outfitId
POST   /api/ai/track
POST   /api/ai/style-quiz
```

### Admin
```
POST   /api/admin/login
GET    /api/admin/users
GET    /api/admin/users/:userId
PATCH  /api/admin/users/:userId/ban
PATCH  /api/admin/users/:userId/unban
GET    /api/admin/partners
GET    /api/admin/partners/:partnerId
PATCH  /api/admin/partners/:partnerId/approve
PATCH  /api/admin/partners/:partnerId/reject
PATCH  /api/admin/partners/:partnerId/ban
GET    /api/admin/outfits
DELETE /api/admin/outfits/:outfitId
GET    /api/admin/comments
DELETE /api/admin/comments/:commentId
GET    /api/admin/orders
GET    /api/admin/orders/:orderId
GET    /api/admin/analytics
GET    /api/admin/admins
POST   /api/admin/admins
PATCH  /api/admin/admins/:adminId
```

---

## 🔌 Socket.io Events

### Server Emits
| Event | Room | Description |
|-------|------|-------------|
| `new_notification` | `user:id` / `partner:id` | Real-time notification |
| `new_message` | `user:id` / `partner:id` | New chat message |
| `messages_read` | sender's room | Read receipt |
| `message_deleted` | receiver's room | Message removed |
| `user_typing` | receiver's room | Typing indicator |

### Client Emits
| Event | Payload | Description |
|-------|---------|-------------|
| `join_outfit_room` | outfitId | Join outfit live room |
| `join_conversation` | conversationId | Join chat room |
| `typing` | `{conversationId, receiverRoom}` | Start typing |
| `stop_typing` | `{conversationId, receiverRoom}` | Stop typing |

---

## 🤖 AI Scoring Algorithm

Every outfit is scored 0-100 for each user:

| Factor | Max Points | Description |
|--------|-----------|-------------|
| Category match | 40 | Based on user's interaction history |
| Followed partner | 20 | Partner follow bonus |
| Tag overlap | 15 | stylePreferences vs outfit tags |
| Direct category pref | 10 | Category in stylePreferences |
| Trending score | 10 | Views + likes weighted |
| Freshness | 5 | Recently posted bonus |

### Interaction Weights
| Action | Weight |
|--------|--------|
| order | 5.0 |
| share | 3.5 |
| bookmark | 3.0 |
| comment | 2.5 |
| like | 2.0 |
| view | 0.5 |

---

## 🔒 Security Measures

| Layer | Implementation |
|-------|---------------|
| Headers | Helmet.js (15+ headers) |
| CORS | Whitelist with credentials |
| Rate Limiting | Route-specific limits |
| NoSQL Injection | express-mongo-sanitize |
| XSS | Input escaping + CSP headers |
| HPP | express-hpp |
| Passwords | bcrypt (salt: 12) |
| Tokens | JWT + httpOnly cookies |
| Validation | express-validator on all routes |

### Rate Limits
| Route | Limit | Window |
|-------|-------|--------|
| Global | 100 req | 15 min |
| Auth (login/register) | 10 req | 15 min |
| Admin login | 5 req | 15 min |
| File upload | 20 req | 1 hour |
| Search | 30 req | 1 min |
| AI endpoints | 20 req | 1 min |

---

## 📊 Database Models

| Model | Collection | Key Fields |
|-------|-----------|-----------|
| User | users | email, password, categoryScores |
| FashionPartner | fashionpartners | brandName, isApproved |
| OutfitItem | outfititems | video, price, tags, text index |
| Like | likes | user+outfit compound unique |
| Bookmark | bookmarks | user+outfit compound unique |
| Follow | follows | follower+following compound unique |
| Comment | comments | parentComment for replies |
| Cart | carts | user unique, priceAtAdd locking |
| Order | orders | orderNumber (DRP-YYYYMM-XXXXXX) |
| Notification | notifications | recipient+model+type |
| Message | messages | conversationId (sorted IDs) |
| Admin | admins | role + permissions array |

---

## 🧪 Testing

All 80+ endpoints tested with Postman.

Test collections cover:
- Happy path (success scenarios)
- Error cases (400, 401, 403, 404, 422, 429)
- Security attacks (NoSQL injection, XSS, fake tokens)
- Edge cases (empty cart checkout, rate limits)
- Real-time (Socket.io events)

---

## 📦 Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | 18+ | Runtime |
| Express | 4.x | Web framework |
| MongoDB | Atlas | Database |
| Mongoose | 7.x | ODM |
| Socket.io | 4.x | Real-time |
| JWT | 9.x | Authentication |
| bcryptjs | 2.x | Password hashing |
| Stripe | 14.x | Payments |
| ImageKit | 4.x | CDN / Media |
| Winston | 3.x | Logging |
| Helmet | 7.x | Security headers |
| express-rate-limit | 7.x | Rate limiting |
| express-validator | 7.x | Input validation |
| express-mongo-sanitize | 2.x | NoSQL injection |
| Multer | 1.x | File handling |

---

## 👨‍💻 Author

Built with ❤️ as a portfolio project demonstrating production-grade MERN stack development.

---

## 📄 License

MIT License — free to use for learning and portfolio purposes.

// src/models/user.js
import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, index: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: null }, // không required cho tài khoản OAuth
    name: { type: String, default: "" },
    roles: { type: [String], default: ["user"] },
    emailVerified: { type: Boolean, default: false },

    // OAuth
    provider: { type: String, default: null }, // ví dụ: 'google'
    providerId: { type: String, default: null }, // Google "sub"
    avatar: { type: String, default: "" },
    oauthProfile: { type: Object, default: {} }, // raw userinfo (tuỳ chọn)
  },
  { timestamps: true }
);

// Chuẩn hoá email trước khi lưu
UserSchema.pre("save", function (next) {
  if (this.isModified("email") && typeof this.email === "string") {
    this.email = this.email.toLowerCase().trim();
  }
  next();
});

// Ẩn một số field khi trả JSON (phòng trường hợp serialize trực tiếp)
UserSchema.set("toJSON", {
  transform(doc, ret) {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    // tuỳ chọn: nếu không muốn lộ thông tin chi tiết từ Google
    // delete ret.oauthProfile
    return ret;
  },
});

// Unique email nếu có email (và không rỗng)
UserSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      email: { $exists: true, $type: "string", $ne: "" },
    },
  }
);

// Unique trên provider + providerId nếu có
UserSchema.index(
  { provider: 1, providerId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      provider: { $exists: true, $type: "string" },
      providerId: { $exists: true, $type: "string" },
    },
  }
);

export const User = mongoose.models.User || mongoose.model("User", UserSchema);

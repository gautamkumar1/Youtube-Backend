import mongoose, {Schema} from "mongoose";
import jwt from "jsonwebtoken"
import bcrypt from "bcrypt"

const userSchema = new Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true, 
            index: true
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowecase: true,
            trim: true, 
        },
        fullName: {
            type: String,
            required: true,
            trim: true, 
            index: true
        },
        avatar: {
            type: String, // cloudinary url
            required: true,
        },
        coverImage: {
            type: String, // cloudinary url
        },
        watchHistory: [
            {
                type: Schema.Types.ObjectId,
                ref: "Video"
            }
        ],
        password: {
            type: String,
            required: [true, 'Password is required']
        },
        refreshToken: {
            type: String
        }

    },
    {
        timestamps: true
    }
)

userSchema.pre("save", async function (next) {
    // Agar password ko modify nahi kiya gaya hai, to agle middleware mein jaayein
    if(!this.isModified("password")) return next();

    // Password ko bcrypt ke saath hash karein, 10 rounds mein
    this.password = await bcrypt.hash(this.password, 10)
    // Agla middleware ko bulayein
    next()
})


userSchema.methods.isPasswordCorrect = async function(password){
    // Password ko bcrypt.compare() ke saath compare karein, aur result ko return karein
    return await bcrypt.compare(password, this.password)
}


userSchema.methods.generateAccessToken = function(){
    // JWT se naya access token generate karein
    return jwt.sign(
        {
            // Access token ke saath shamil karni hai ye information
            _id: this._id,
            email: this.email,
            username: this.username,
            fullName: this.fullName
        },
        // Access token secret aur expiry process.env se lekar use karein
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn: process.env.ACCESS_TOKEN_EXPIRY
        }
    )
}

userSchema.methods.generateRefreshToken = function(){
    return jwt.sign(
        {
            _id: this._id,
            
        },
        process.env.REFRESH_TOKEN_SECRET,
        {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRY
        }
    )
}

export const User = mongoose.model("User", userSchema)
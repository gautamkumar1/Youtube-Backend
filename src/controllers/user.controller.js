import { asyncHandler } from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js"
import { User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js";
/*
 * / / / / / / / / / / / / / /
 * GENERATE ACCESS AND REFRESH TOKE
 *  / / / / / / / / / / / / / /
 */
const generateAccessAndRefreshToken= async (userId) => {
    try {
        
    } catch (error) {
        throw new ApiError(500,"Something went wrong while creating access and refresh token")
    }
}
/*
 * / / / / / / / / / / / / / /
 * REGISTER LOGIC
 *  / / / / / / / / / / / / / /
 */
const registerUser = asyncHandler(async (req, res) => {
    // Frontend se user ke details prapt karein
    // Validation - koi bhi field khali nahi hona chahiye
    // Check karein kya user pehle se maujood hai: username, email
    // Images ke liye check karein, avatar ke liye check karein
    // Cloudinary mein upload karein, avatar ko
    // User object banayein - db mein entry banayein
    // Response se password aur refresh token field ko hata dein
    // User creation ka check karein
    // Response bhejein

    const { fullName, email, username, password } = req.body

    // Khali fields ka check karein
    if ([fullName, email, username, password].some((field) => field?.trim() === "")) {
        throw new ApiError(400, "All fields are required")
    }

    // User ko username ya email se dhundein
    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })

    // Agar user maujood hai toh error throw karein
    if (existedUser) {
        throw new ApiError(409, "User with email or username already exists")
    }

    // Avatar ka local path prapt karein
    const avatarLocalPath = req.files?.avatar[0]?.path;

    // Cover image ka local path prapt karein
    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path
    }
    
    // Agar avatar ka local path nahi mila toh error throw karein
    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required")
    }

    // Avatar aur cover image ko Cloudinary mein upload karein
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    // Agar avatar upload nahi hua toh error throw karein
    if (!avatar) {
        throw new ApiError(400, "Avatar file is required")
    }

    // User create karein
    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email, 
        password,
        username: username.toLowerCase()
    })

    // Banaye gaye user ko find karein aur password aur refresh token ko exclude karein
    const createdUser = await User.findById(user._id).select("-password -refreshToken")

    // Agar user create nahi hua toh error throw karein
    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while registering the user")
    }

    // Success response bhejein
    return res.status(201).json(new ApiResponse(200, createdUser, "User registered Successfully"))
})


/*
 * / / / / / / / / / / / / / /
 * LOGIN LOGIC
 *  / / / / / / / / / / / / / /
 */
const loginUser = asyncHandler(async (req, res) => {
    // req.body se data prapt karein
    // username aur email khali nahi hone chahiye
    // username aur email dhundhein
    // password sahi hai ya nahi check karein
    // refresh token generate karein
    // access token generate karein
    // cookie bhejein

    const { username, email, password } = req.body

    // Username aur email khali nahi hone chahiye
    if (!username || !email) {
        throw new ApiError(400, "Username or password is required")
    }

    // Username ya email se user ko dhundhein
    const user = await User.findOne({
        $or: [{ username }, { email }]
    })

    // Agar user nahi mila toh error throw karein
    if (!user) {
        throw new ApiError(401, "User does not exist")
    }

    // Password sahi hai ya nahi check karein
    const isPasswordCorrect = await user.isPasswordCorrect(password)
    if (!isPasswordCorrect) {
        throw new ApiError(401, "Invalid credentials")
    }

    // Success response bhejein
    return res.status(200).json(new ApiResponse(200, "User logged in successfully"))
})

export {registerUser,loginUser}


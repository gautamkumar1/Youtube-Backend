import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
/*
 * / / / / / / / / / / / / / /
 * GENERATE ACCESS AND REFRESH TOKE
 *  / / / / / / / / / / / / / /
 */
const generateAccessAndRefreshTokens = async (userId) => {
  try {
    // User ko userId se dhundhein
    const user = await User.findById(userId);

    // Access token aur refresh token generate karein
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    // Refresh token ko user object mein save karein
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    // Access token aur refresh token ko return karein
    return { accessToken, refreshToken };
  } catch (error) {
    // Koi error aane par error throw karein
    throw new ApiError(
      500,
      "Something went wrong while generating refresh and access token"
    );
  }
};

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

  const { fullName, email, username, password } = req.body;

  // Khali fields ka check karein
  if (
    [fullName, email, username, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All fields are required");
  }

  // User ko username ya email se dhundein
  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  // Agar user maujood hai toh error throw karein
  if (existedUser) {
    throw new ApiError(409, "User with email or username already exists");
  }

  // Avatar ka local path prapt karein
  const avatarLocalPath = req.files?.avatar[0]?.path;

  // Cover image ka local path prapt karein
  let coverImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  // Agar avatar ka local path nahi mila toh error throw karein
  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }

  // Avatar aur cover image ko Cloudinary mein upload karein
  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  // Agar avatar upload nahi hua toh error throw karein
  if (!avatar) {
    throw new ApiError(400, "Avatar file is required");
  }

  // User create karein
  const user = await User.create({
    fullName,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase(),
  });

  // Banaye gaye user ko find karein aur password aur refresh token ko exclude karein
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  // Agar user create nahi hua toh error throw karein
  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user");
  }

  // Success response bhejein
  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered Successfully"));
});

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

  const { username, email, password } = req.body;

  // Username aur email khali nahi hone chahiye
  if (!username && !email) {
    throw new ApiError(400, "Username or password is required");
  }
  // Here is an alternative of above code based on logic discussed in video:
  // if (!(username || email)) {
  //     throw new ApiError(400, "username or email is required")

  // }
  // Username ya email se user ko dhundhein
  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  // Agar user nahi mila toh error throw karein
  if (!user) {
    throw new ApiError(401, "User does not exist");
  }

  // Password sahi hai ya nahi check karein
  const isPasswordValid = await user.isPasswordCorrect(password)

   if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials")
    }

   const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200, 
            {
                user: loggedInUser, accessToken, refreshToken
            },
            "User logged In Successfully"
        )
    )
});


/*
  * / / / / / / / / / / / / / /
 * LOGOUT LOGIC
 *  / / / / / / / / / / / / / /
 */

const logoutUser = asyncHandler(async (req, res) => {
    // User ke ID ke basis par refreshToken ko unset karein
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshToken: 1 // ye field ko document se hata dega
            }
        },
        {
            new: true
        }
    )

    // Cookie options
    const options = {
        httpOnly: true, // HTTP only cookie, JavaScript ke through access nahi hoga
        secure: true    // Secure cookie, HTTPS ke through hi access hoga
    }

    // Success response bhejein, aur cookies ko clear karein
    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "User logged Out"))
})

/* / / / / / / / / / / / / / /
* REFRESH TOKEN LOGIC - LIFE SPAIN OF ACCESS TOKEN 
*  / / / / / / / / / / / / / /
*/

const refreshAccessToken = asyncHandler(async (req, res) => {
  // Incoming refresh token ko cookies ya req.body se prapt karein
  const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

  if (!incomingRefreshToken) {
      // Agar refresh token nahi mila toh error throw karein
      throw new ApiError(401, "Unauthorized request")
  }

  try {
      // Refresh token ko verify karein
      const decodedToken = jwt.verify(
          incomingRefreshToken,
          process.env.REFRESH_TOKEN_SECRET
      )
  
      // Token se user ko dhundhein
      const user = await User.findById(decodedToken?._id)
  
      if (!user) {
          // Agar user nahi mila toh error throw karein
          throw new ApiError(401, "Invalid refresh token")
      }
  
      // Agar incoming refresh token user ke refresh token se match nahi karta toh error throw karein
      if (incomingRefreshToken !== user?.refreshToken) {
          throw new ApiError(401, "Refresh token is expired or used")
      }
  
      // Cookie options
      const options = {
          httpOnly: true, // HTTP only cookie, JavaScript ke through access nahi hoga
          secure: true    // Secure cookie, HTTPS ke through hi access hoga
      }
  
      // Naya access token aur refresh token generate karein
      const { accessToken, newRefreshToken } = await generateAccessAndRefreshTokens(user._id)
  
      // Success response bhejein aur cookies set karein
      return res
          .status(200)
          .cookie("accessToken", accessToken, options)
          .cookie("refreshToken", newRefreshToken, options)
          .json(
              new ApiResponse(
                  200, 
                  { accessToken, refreshToken: newRefreshToken },
                  "Access token refreshed"
              )
          )
  } catch (error) {
      // Koi error aaye toh use catch karein aur error throw karein
      throw new ApiError(401, error?.message || "Invalid refresh token")
  }
})

/*
  * / / / / / / / / / / / / / /
 * CHANGE USER CURRENT PASSWORD
 *  / / / / / / / / / / / / / /
 */

const changeUserCurrentPassword = asyncHandler(async (req, res) => {
    const {oldPassword, newPassword} = req.body;
    const user = await User.findById(req.user?._id)
    const isPasswordValid = await user.isPasswordCorrect(oldPassword)
    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid old password")
    }
    user.password = newPassword
    await user.save({validateBeforeSave:false})
 
    return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"))
})

/*
  * / / / / / / / / / / / / / /
 * get current user
 *  / / / / / / / / / / / / / /
 */

const getCurrentUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user?._id).select("-password -refreshToken")
    if (!user) {
        throw new ApiError(404, "User not found")
    }
    return res
     .status(200)
     .json(new ApiResponse(200, user, "User found"))
})

/*
  * / / / / / / / / / / / / / /
 * update account details
 *  / / / / / / / / / / / / / /
 */

const updateAccountDetails = asyncHandler(async (req, res) => {
    const {fullName,email} = req.body;
    if(!fullName || !email){
      throw new ApiError(400,"All fields are required")
    }
    const user = await User.findByIdAndUpdate(
      req.user?._id,
      {
        $set:{
          fullName,
          email
        }
      },
      {new: true}).select("-password")
      return res.status(200).json(new ApiResponse(200,user,"Account details updated successfully"))
})

/*
  * / / / / / / / / / / / / / /
 * update avatar image
 *  / / / / / / / / / / / / / /
 */

const updateUserAvatar = asyncHandler(async(req, res) => {
  const avatarLocalPath = req.file?.path

  if (!avatarLocalPath) {
      throw new ApiError(400, "Avatar file is missing")
  }



  const avatar = await uploadOnCloudinary(avatarLocalPath)

  if (!avatar.url) {
      throw new ApiError(400, "Error while uploading on avatar")
      
  }

  const user = await User.findByIdAndUpdate(
      req.user?._id,
      {
          $set:{
              avatar: avatar.url
          }
      },
      {new: true}
  ).select("-password")

  return res
  .status(200)
  .json(
      new ApiResponse(200, user, "Avatar image updated successfully")
  )
})

/*
  * / / / / / / / / / / / / / /
 * update cover image
 *  / / / / / / / / / / / / / /
 */
const updateUserCoverImage = asyncHandler(async(req, res) => {
  const coverImageLocalPath = req.file?.path

  if (!coverImageLocalPath) {
      throw new ApiError(400, "Cover image file is missing")
  }



  const coverImage = await uploadOnCloudinary(coverImageLocalPath)

  if (!coverImage.url) {
      throw new ApiError(400, "Error while uploading on avatar")
      
  }

  const user = await User.findByIdAndUpdate(
      req.user?._id,
      {
          $set:{
              coverImage: coverImage.url
          }
      },
      {new: true}
  ).select("-password")

  return res
  .status(200)
  .json(
      new ApiResponse(200, user, "Cover image updated successfully")
  )
})

/*
  * / / / / / / / / / / / / / /
 * get user channel profile
 *  / / / / / / / / / / / / / /
 */

const getUserChannelProfile = asyncHandler(async(req, res) => {
  const {username} = req.params

  // Agar username khali hai ya undefined hai
  if (!username?.trim()) {
      throw new ApiError(400, "username is missing")
  }

  // Daryaft karne ke liye channel ko database se
  const channel = await User.aggregate([
      {
          $match: {
              // Username ko case-insensitive banane ke liye
              username: username?.toLowerCase()
          }
      },
      {
          $lookup: {
              // subscriptions se data leke aaye, subscribers ko
              from: "subscriptions",
              localField: "_id",
              foreignField: "channel",
              as: "subscribers"
          }
      },
      {
          $lookup: {
              // subscriptions se data leke aaye, jo subscriber hai
              from: "subscriptions",
              localField: "_id",
              foreignField: "subscriber",
              as: "subscribedTo"
          }
      },
      {
          $addFields: {
              // subscribers ka size nikala
              subscribersCount: {
                  $size: "$subscribers"
              },
              // subscribedTo ka size nikala
              channelsSubscribedToCount: {
                  $size: "$subscribedTo"
              },
              // User ke pass channel ka subscription hai ya nahi
              isSubscribed: {
                  $cond: {
                      if: {$in: [req.user?._id, "$subscribers.subscriber"]},
                      then: true,
                      else: false
                  }
              }
          }
      },
      {
          $project: {
              // Zaroori fields ko select kiya
              fullName: 1,
              username: 1,
              subscribersCount: 1,
              channelsSubscribedToCount: 1,
              isSubscribed: 1,
              avatar: 1,
              coverImage: 1,
              email: 1
          }
      }
  ])

  // Agar channel maujood nahi hai
  if (!channel?.length) {
      throw new ApiError(404, "channel does not exists")
  }

  // Response bheja gaya
  return res
  .status(200)
  .json(
      new ApiResponse(200, channel[0], "User channel fetched successfully")
  )
})

/*
  * / / / / / / / / / / / / / /
 * get watch history
 *  / / / / / / / / / / / / / /
 */

const getWatchHistory = asyncHandler(async(req, res) => {
  // User ki watch history ko daryaft karna
  const user = await User.aggregate([
      {
          $match: {
              // User ka ID ke saath match karna
              _id: new mongoose.Types.ObjectId(req.user._id)
          }
      },
      {
          $lookup: {
              // Videos se watch history ko leke aana
              from: "videos",
              localField: "watchHistory",
              foreignField: "_id",
              as: "watchHistory",
              pipeline: [
                  {
                      $lookup: {
                          // Owners ka data leke aana
                          from: "users",
                          localField: "owner",
                          foreignField: "_id",
                          as: "owner",
                          pipeline: [
                              {
                                  $project: {
                                      // Zaroori fields ko select karna
                                      fullName: 1,
                                      username: 1,
                                      avatar: 1
                                  }
                              }
                          ]
                      }
                  },
                  {
                      $addFields:{
                          // Owner ko pehla element banake rakhna
                          owner:{
                              $first: "$owner"
                          }
                      }
                  }
              ]
          }
      }
  ])

  // Response bhejna
  return res
  .status(200)
  .json(
      new ApiResponse(
          200,
          user[0].watchHistory,
          "Watch history fetched successfully"
      )
  )
})

export { registerUser, loginUser ,logoutUser,changeUserCurrentPassword,
  getCurrentUser,updateAccountDetails,updateUserAvatar,updateUserCoverImage,getUserChannelProfile,getWatchHistory,refreshAccessToken};


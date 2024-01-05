const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/mern_auth', { useNewUrlParser: true, useUnifiedTopology: true });

// Define the User model
const User = mongoose.model('User', new mongoose.Schema({
  fullname: String,
  username: String,
  passwordHash: String,
  passwordConfirmation: String,
  role: String,
  approved: { type: Boolean, default: false }, 
}));

// Define the User model
const Course = mongoose.model('Course', new mongoose.Schema({
  courseName: {type: String, required: true},
  description: {type: String, required: true},
  duration: {type: String, required: true},
  startDate: {type: String, required: true},
  objectives: {type: String, required: true},
  courseContent: {type: String, required: true},
  requirements: {type: String, required: true},
  courseFee: {type: String, required: true},
}));

//Define the Order model
const Order = mongoose.model('Order', new mongoose.Schema({
  username: { type: String, required: true },
  courseName: {type: String, required: true},
  courseFee: {type: Number, required: true},
  paymentMethod: {type: String, required: true},
  country: {type: String, required: true},
  paymentStatus: { type: Boolean, default: false },
}));


app.post('/signup', async (req, res) => {
  try {
    const { fullname, username, password, passwordConfirmation, role } = req.body;

    // Check for unique username
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    if (!['admin', 'lecturer', 'student'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const approved = role === 'student' ? false : true;

    // Check if passwords match
    if (password !== passwordConfirmation) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    // Use environment variable for salt rounds
    const saltRounds = process.env.BCRYPT_SALT_ROUNDS || 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const user = new User({ fullname, username, passwordHash, role, approved });
    await user.save();

    res.status(200).json({
      message: 'Signup successful',
      role: user.role,
      username: user.username,
      approved: user.approved,
    });
  } catch (error) {
    console.error('Error in signup', error);
    res.status(500).json({ message: 'Error in signup' });
  }
});

// Create a route to fetch pending student sign-ups
app.get('/admin/pending-students', async (req, res) => {
  try {
    const pendingStudents = await User.find({ role: 'student', approved: false }, 'username');
    res.status(200).json(pendingStudents);
  } catch (error) {
    console.error('Error fetching pending students', error);
    res.status(500).json({ message: 'Error fetching pending students' });
  }
});

// Admin approves a student sign-up
app.post('/admin/approve-student/:username', async (req, res) => {
  const { username } = req.params;

  try {
    const student = await User.findOneAndUpdate({ username, role: 'student' }, { approved: true }, { new: true });
    res.status(200).json({ message: 'Student approved successfully', role: student.role, username: student.username });
  } catch (error) {
    console.error('Error approving student', error);
    res.status(500).json({ message: 'Error approving student' });
  }
});

// Admin login route - hardcoded admin credentials
app.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Hardcoded admin credentials
    const adminUsername = 'admin';
    const adminPassword = 'adminPassword';

    if (username === adminUsername && password === adminPassword) {
      const sessionID = generateRandomString(); 
      res.json({ message: 'Admin login successful', role: 'admin', username: adminUsername, sessionID });
    } else {
      res.status(401).json({ message: 'Invalid admin credentials' });
    }
  } catch (error) {
    console.error('Error in admin login', error);
    res.status(500).json({ message: 'Error in admin login' });
  }
});

// Login route
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if the user is approved
    if (!user.approved) {
      return res.status(401).json({ message: 'User not yet approved' });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    res.status(200).json({ message: 'Login successful', role: user.role, username: user.username });
  } catch (error) {
    console.error('Error in login', error);
    res.status(500).json({ message: 'Error in login' });
  }
});

// Logout route
app.post('/logout', (req, res) => {
  res.status(200).json({ message: 'Logout successful' });
});

// Function to generate a random string using build-in methods
function generateRandomString() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Enrolled students route
app.get('/admin/enrolled-students/:username', async (req, res) => {
  try {
    const users = await User.find({role: 'student', approved: true,});
    console.log('Fetched users:', users);
    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching users', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// Route to fetch pending course enrollments
app.get('/get-pending-enrollments', async (req, res) => {
  try {
    const pendingEnrollments = await Order.find({ paymentStatus: false });
    res.status(200).json(pendingEnrollments);
  } catch (error) {
    console.error('Error fetching pending enrollments', error);
    res.status(500).json({ message: 'Error fetching pending enrollments' });
  }
});

//Route for fetching approved enrollments
app.get('/get-approved-enrollments', async (req, res) => {
  try {
    const approvedEnrollments = await Order.find({ paymentStatus: true }).populate('username', 'fullname');
    res.status(200).json(approvedEnrollments);
  } catch (error) {
    console.error('Error fetching approved enrollments', error);
    res.status(500).json({ message: 'Error fetching approved enrollments' });
  }
});

// Route to update enrollment status
app.post('/update-enrollment-status/:id', async (req, res) => {
  const orderId = req.params.id;

  try {
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    order.paymentStatus = true;
    await order.save();

    res.status(200).json({ message: 'Enrollment status updated successfully' });
  } catch (error) {
    console.error('Error updating enrollment status', error);
    res.status(500).json({ message: 'Error updating enrollment status' });
  }
});

// Add a course route
app.post('/add-course', async (req, res) => {
  try {
    const { courseName, description, duration, startDate, objectives, courseContent, requirements, courseFee } = req.body;
    const course = new Course({ courseName, description, duration, startDate, objectives, courseContent, requirements, courseFee });
    await course.save();
    res.status(200).json({ message: 'Course added successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error adding course' });
  }
});

// Route to fetch available courses
app.get('/get-courses', async (req, res) => {
  try {
    const courses = await Course.find({});
    console.log('Fetched courses:', courses);
    res.status(200).json(courses);
  } catch (error) {
    console.error('Error fetching courses', error);
    res.status(500).json({ message: 'Error fetching courses' });
  }
});

// Route to fetch details of a specific course by ID
app.get('/get-course/:id', async (req, res) => {
  try {
    const courseId = req.params.id;
    const course = await Course.findById(courseId);
    
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    console.log('Fetched course details:', course);
    res.status(200).json(course);
  } catch (error) {
    console.error('Error fetching course details', error);
    res.status(500).json({ message: 'Error fetching course details' });
  }
});

// Route to save checkout details
app.post('/saveOrder', async (req, res) => {
  try {
    const { username, courseName, courseFee, paymentMethod, country } = req.body;
    const order = new Order({ username, courseName, courseFee, paymentMethod, country, paymentStatus: false,});
    await order.save();

    res.status(200).json({ message: 'Order added successfully' });
  } catch (error) {
    console.error('Error adding order', error);
    res.status(500).json({ message: 'Error adding order' });
  }
});


// Route to update payment status
app.post('/admin/update-payment/:id', async (req, res) => {
  const studentId = req.params.id;

  try {
    // Find the user by ID
    const student = await User.findById(studentId);

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Update payment status to true
    student.paymentStatus = true;

    // Save the updated user
    await student.save();

    res.status(200).json({ message: 'Payment status updated successfully' });
  } catch (error) {
    console.error('Error updating payment status', error);
    res.status(500).json({ message: 'Error updating payment status' });
  }
});

//Route for my courses in sthe student dashboard
app.get('/student/my-courses/:username', async (req, res) => {
  const { username } = req.params;

  try {
    const student = await User.findOne({ username, role: 'student', approved: true });
    
    if (!student) {
      return res.status(404).json({ message: 'Student not found or not approved' });
    }

    const myCourses = await Order.find({ username, paymentStatus: true });
    res.status(200).json(myCourses);
  } catch (error) {
    console.error('Error fetching student\'s courses', error);
    res.status(500).json({ message: 'Error fetching student\'s courses' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

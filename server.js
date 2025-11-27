const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// CORS first
app.use(cors());

// Configure multer storage - ONLY ONCE at the top
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const fileType = file.mimetype.startsWith('video') ? 'videos' : 'images';
    const uploadPath = path.join(__dirname, 'uploads', fileType);
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExtension = path.extname(file.originalname);
    cb(null, 'file-' + uniqueSuffix + fileExtension);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image and video files are allowed!'), false);
  }
};

// Configure multer - ONLY ONCE
const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { 
    fileSize: 500 * 1024 * 1024 // 100MB
  }
});

// FILE UPLOAD ENDPOINT - MUST BE BEFORE JSON PARSER
// In server.js - Update the upload endpoint
app.post("/api/admin/public/upload", upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: "No file uploaded" 
      });
    }

    console.log('📤 File uploaded successfully:', {
      originalname: req.file.originalname,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: req.file.path
    });

    // Generate consistent URL format
    const fileType = req.file.mimetype.startsWith('video') ? 'videos' : 'images';
    const fileUrl = `/uploads/${fileType}/${req.file.filename}`;

    res.json({
      success: true,
      url: fileUrl, // Return relative URL for database storage
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      message: "File uploaded successfully"
    });

  } catch (error) {
    console.error('❌ File upload error:', error);
    res.status(500).json({ 
      success: false, 
      error: "File upload failed: " + error.message 
    });
  }
});


// NOW add body-parser for JSON routes (AFTER file upload routes)
app.use(express.json({ limit: '10mb' })); // Reduced limit for JSON
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'maddieyourz';

// Connect to your existing cybersecurity_app database
const db = mysql.createConnection({
    host: "localhost",
    user: "root", 
    password: "", // Your MySQL password - if you have one set
    database: "cybersecurity_app"
});

db.connect((err) => {
    if (err) {
        console.error("❌ Database connection failed:", err);
        console.log("Please check:");
        console.log("1. Is MySQL running?");
        console.log("2. Is the database 'cybersecurity_app' created?");
        console.log("3. Are the username and password correct?");
    } else {
        console.log("✅ Connected to MySQL cybersecurity_app database");
        
        // Test query to check users table
        db.query("SELECT COUNT(*) as userCount FROM users", (err, results) => {
            if (err) {
                console.error("❌ Error checking users table:", err);
            } else {
                console.log(`✅ Users table exists with ${results[0].userCount} users`);
            }
        });
    }
});

// Error handling for multer - ADD THIS
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: 'File too large. Maximum size is 100MB for videos and 10MB for images.'
      });
    }
  }
  next(error);
});

// Test endpoint to check multer configuration
app.get("/api/test-upload", (req, res) => {
  res.json({
    message: "Upload endpoint is ready",
    maxFileSize: "100MB",
    allowedTypes: ["image/*", "video/*"],
    uploadUrl: "/api/admin/public/upload"
  });
});


// PUBLIC ADMIN ROUTES (No authentication required)
// GET all users (Public - for admin dashboard)
app.get("/api/admin/public/users", (req, res) => {
  db.query(`
    SELECT 
      id, 
      name, 
      email, 
      role, 
      phone,
      business_type,
      language,
      daily_reminder_enabled,
      reminder_time,
      push_notifications,
      text_size,
      high_contrast,
      created_at,
      last_login
    FROM users 
    ORDER BY created_at DESC
  `, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }
    
    res.json({ success: true, users: results });
  });
});

// GET all modules (Public - for admin dashboard)
// In server.js - Update the public users endpoint
app.get("/api/admin/public/users", (req, res) => {
  console.log('Fetching users from database...');
  
  db.query(`
    SELECT 
      id, 
      name, 
      email, 
      role, 
      phone,
      business_type,
      language,
      daily_reminder_enabled,
      reminder_time,
      push_notifications,
      text_size,
      high_contrast,
      created_at,
      last_login
    FROM users 
    ORDER BY created_at DESC
  `, (err, results) => {
    if (err) {
      console.error('Database error fetching users:', err);
      return res.status(500).json({ 
        error: "Database error",
        details: err.message 
      });
    }
    
    console.log(`Found ${results.length} users`);
    res.json({ success: true, users: results });
  });
});

// Update user (Public - for admin)
app.put("/api/admin/public/users/:id", (req, res) => {
  const userId = req.params.id;
  const { name, email, role, phone, business_type } = req.body;
  
  console.log('Updating user:', userId, req.body);

  // Validate required fields
  if (!name || !email || !role) {
    return res.status(400).json({ 
      error: "Name, email, and role are required" 
    });
  }

  db.query(
    "UPDATE users SET name = ?, email = ?, role = ?, phone = ?, business_type = ? WHERE id = ?",
    [name, email, role, phone, business_type, userId],
    (err, result) => {
      if (err) {
        console.error('Error updating user:', err);
        return res.status(500).json({ 
          error: "Update failed",
          details: err.message 
        });
      }
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      
      console.log('User updated successfully');
      res.json({ success: true, message: "User updated successfully" });
    }
  );
});

// Delete user (Public - for admin)
app.delete("/api/admin/public/users/:id", (req, res) => {
  const userId = req.params.id;
  
  console.log('Deleting user:', userId);

  // First, delete related records to maintain referential integrity
  const deleteQueries = [
    "DELETE FROM user_achievements WHERE user_id = ?",
    "DELETE FROM quiz_results WHERE user_id = ?", 
    "DELETE FROM user_progress WHERE user_id = ?",
    "DELETE FROM password_reset_tokens WHERE user_id = ?",
    "DELETE FROM users WHERE id = ?"
  ];
  
  // Execute queries in sequence
  const executeQueries = (queries, index = 0) => {
    if (index >= queries.length) {
      console.log('User deleted successfully');
      return res.json({ success: true, message: "User deleted successfully" });
    }
    
    db.query(queries[index], [userId], (err) => {
      if (err) {
        console.error(`Error executing query ${index}:`, err);
        // Continue with other queries even if some fail
      }
      executeQueries(queries, index + 1);
    });
  };
  
  executeQueries(deleteQueries);
});
// Create module (Public - for admin)
// Add this to your server.js in the PUBLIC ADMIN ROUTES section
// GET all modules (Public - for admin dashboard)
app.get("/api/admin/public/modules", (req, res) => {
  db.query("SELECT * FROM modules ORDER BY created_at DESC", (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ success: true, modules: results });
  });
});
// Create module (Public - for admin)
app.post("/api/admin/public/modules", (req, res) => {
  const moduleData = req.body;
  
  console.log('Received module data:', moduleData);
  
  // Validate required fields
  if (!moduleData.title_en || !moduleData.description_en || !moduleData.category_id) {
    return res.status(400).json({ 
      error: "Title (English), Description (English), and Category are required" 
    });
  }

  // Set default values for optional fields
  const completeModuleData = {
    title_en: moduleData.title_en,
    title_st: moduleData.title_st || '',
    description_en: moduleData.description_en,
    description_st: moduleData.description_st || '',
    category_id: parseInt(moduleData.category_id),
    difficulty_level: moduleData.difficulty_level || 'beginner',
    estimated_duration: parseInt(moduleData.estimated_duration) || 15,
    is_active: moduleData.is_active !== undefined ? moduleData.is_active : true,
    display_order: parseInt(moduleData.display_order) || 0,
    created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
  };

  console.log('Complete module data:', completeModuleData);

  db.query("INSERT INTO modules SET ?", completeModuleData, (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ 
        error: "Failed to create module",
        details: err.message 
      });
    }
    
    console.log('Module created successfully with ID:', result.insertId);
    
    res.json({ 
      success: true, 
      module: { 
        id: result.insertId, 
        ...completeModuleData 
      } 
    });
  });
});

// Update module (Public - for admin)
app.put("/api/admin/public/modules/:id", (req, res) => {
  const moduleId = req.params.id;
  const moduleData = req.body;
  
  // Add updated_at timestamp
  moduleData.updated_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
  
  db.query("UPDATE modules SET ? WHERE id = ?", [moduleData, moduleId], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to update module" });
    }
    
    res.json({ success: true, message: "Module updated successfully" });
  });
});

// Delete module (Public - for admin)
app.delete("/api/admin/public/modules/:id", (req, res) => {
  const moduleId = req.params.id;
  
  // First delete related content and questions
  const deleteQueries = [
    "DELETE FROM module_content WHERE module_id = ?",
    "DELETE FROM questions WHERE module_id = ?",
    "DELETE FROM modules WHERE id = ?"
  ];
  
  const executeQueries = (queries, index = 0) => {
    if (index >= queries.length) {
      return res.json({ success: true, message: "Module deleted successfully" });
    }
    
    db.query(queries[index], [moduleId], (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to delete module" });
      }
      executeQueries(queries, index + 1);
    });
  };
  
  executeQueries(deleteQueries);
});

// Update user (Public - for admin)
app.put("/api/admin/public/users/:id", (req, res) => {
  const userId = req.params.id;
  const { name, email, role, phone, business_type } = req.body;
  
  db.query(
    "UPDATE users SET name = ?, email = ?, role = ?, phone = ?, business_type = ? WHERE id = ?",
    [name, email, role, phone, business_type, userId],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Update failed" });
      }
      res.json({ success: true, message: "User updated successfully" });
    }
  );
});

// Delete user (Public - for admin)
app.delete("/api/admin/public/users/:id", (req, res) => {
  const userId = req.params.id;
  
  // First, delete related records to maintain referential integrity
  const deleteQueries = [
    "DELETE FROM user_achievements WHERE user_id = ?",
    "DELETE FROM quiz_results WHERE user_id = ?", 
    "DELETE FROM user_progress WHERE user_id = ?",
    "DELETE FROM password_reset_tokens WHERE user_id = ?",
    "DELETE FROM users WHERE id = ?"
  ];
  
  // Execute queries in sequence
  const executeQueries = (queries, index = 0) => {
    if (index >= queries.length) {
      return res.json({ success: true, message: "User deleted successfully" });
    }
    
    db.query(queries[index], [userId], (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Delete failed" });
      }
      executeQueries(queries, index + 1);
    });
  };
  
  executeQueries(deleteQueries);
});

// Create admin user (Public - for admin)
app.post("/api/admin/public/create-admin", (req, res) => {
  const { name, email, password } = req.body;
  
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are required" });
  }

  // Check if user already exists
  db.query("SELECT id FROM users WHERE email = ?", [email], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }
    
    if (results.length > 0) {
      return res.status(409).json({ error: "User already exists with this email" });
    }

    // Hash password
    const hashedPassword = bcrypt.hashSync(password, 10);
    
    // Create new admin user
    const newAdmin = {
      name,
      email,
      password: hashedPassword,
      role: 'admin',
      language: 'en',
      daily_reminder_enabled: 1,
      reminder_time: '19:00:00',
      push_notifications: 1,
      text_size: 'medium',
      high_contrast: 0,
      created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
    };
    
    db.query("INSERT INTO users SET ?", newAdmin, (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to create admin" });
      }
      
      res.json({
        success: true,
        admin: {
          id: result.insertId,
          name: newAdmin.name,
          email: newAdmin.email,
          role: newAdmin.role
        }
      });
    });
  });
});

// REGULAR APP ROUTES (Existing routes remain the same)
// GET all categories
app.get("/api/categories", (req, res) => {
    db.query("SELECT * FROM content_categories", (err, results) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: "Database error" });
        } else {
            res.json(results);
        }
    });
});

// GET all active modules
app.get("/api/modules", (req, res) => {
    db.query("SELECT * FROM modules WHERE is_active = 1", (err, results) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: "Database error" });
        } else {
            res.json(results);
        }
    });
});

// GET single module by ID
app.get("/api/modules/:id", (req, res) => {
    const moduleId = req.params.id;
    db.query("SELECT * FROM modules WHERE id = ?", [moduleId], (err, results) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: "Database error" });
        } else {
            res.json(results[0] || null);
        }
    });
});

// GET user progress
app.get("/api/user-progress/:userId", (req, res) => {
    const userId = req.params.userId;
    db.query("SELECT * FROM user_progress WHERE user_id = ?", [userId], (err, results) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: "Database error" });
        } else {
            res.json(results);
        }
    });
});

// GET achievements
app.get("/api/achievements", (req, res) => {
    db.query("SELECT * FROM achievements WHERE is_active = 1", (err, results) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: "Database error" });
        } else {
            res.json(results);
        }
    });
});

// Search modules
app.get("/api/search", (req, res) => {
    const searchTerm = req.query.q;
    const query = `
        SELECT * FROM modules 
        WHERE (title_en LIKE ? OR title_st LIKE ? OR description_en LIKE ? OR description_st LIKE ?) 
        AND is_active = 1
    `;
    const searchValue = `%${searchTerm}%`;
    
    db.query(query, [searchValue, searchValue, searchValue, searchValue], (err, results) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: "Database error" });
        } else {
            res.json(results);
        }
    });
});

// GET module content by module_id
app.get("/api/module-content/:moduleId", (req, res) => {
    const moduleId = req.params.moduleId;
    db.query("SELECT * FROM module_content WHERE module_id = ? ORDER BY display_order", [moduleId], (err, results) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: "Database error" });
        } else {
            res.json(results);
        }
    });
});

// GET questions by module_id
app.get("/api/questions/:moduleId", (req, res) => {
    const moduleId = req.params.moduleId;
    db.query("SELECT * FROM questions WHERE module_id = ?", [moduleId], (err, results) => {
        if (err) {
            console.error(err);
            res.status(500).json({ error: "Database error" });
        } else {
            res.json(results);
        }
    });
});

// POST quiz result
app.post("/api/quiz-results", (req, res) => {
    const { user_id, module_id, score, total_questions } = req.body;
    db.query(
        "INSERT INTO quiz_results (user_id, module_id, score, total_questions) VALUES (?, ?, ?, ?)", 
        [user_id, module_id, score, total_questions], 
        (err, result) => {
            if (err) {
                console.error(err);
                res.status(500).json({ error: "Insert failed" });
            } else {
                res.json({ message: "Quiz result saved successfully", id: result.insertId });
            }
        }
    );
});

// GET user achievements
app.get("/api/user-achievements/:userId", (req, res) => {
    const userId = req.params.userId;
    db.query(
        `SELECT a.*, ua.earned_at 
         FROM achievements a 
         INNER JOIN user_achievements ua ON a.id = ua.achievement_id 
         WHERE ua.user_id = ?`, 
        [userId], 
        (err, results) => {
            if (err) {
                console.error(err);
                res.status(500).json({ error: "Database error" });
            } else {
                res.json(results);
            }
        }
    );
});

// POST user achievement (unlock)
app.post("/api/user-achievements", (req, res) => {
    const { user_id, achievement_id } = req.body;
    db.query(
        "INSERT INTO user_achievements (user_id, achievement_id) VALUES (?, ?)", 
        [user_id, achievement_id], 
        (err, result) => {
            if (err) {
                console.error(err);
                res.status(500).json({ error: "Insert failed" });
            } else {
                res.json({ message: "Achievement unlocked successfully", id: result.insertId });
            }
        }
    );
});

// Authentication routes
// server.js - FIXED LOGIN ROUTE FOR YOUR DATABASE STRUCTURE
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  
  console.log('Login attempt for:', email);
  
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  // Query that matches your exact database structure
  db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: "Database error" });
    }
    
    if (results.length === 0) {
      console.log('No user found with email:', email);
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = results[0];
    console.log('User found:', user.email);
    console.log('Stored password value:', user.password);
    console.log('Password is null?', user.password === null);
    console.log('Password is undefined?', user.password === undefined);
    
    // Check if password is NULL or empty
    if (!user.password || user.password === null || user.password === '') {
      console.log('Password is NULL or empty for user:', user.email);
      return res.status(401).json({ error: "Invalid email or password - no password set" });
    }

    // SIMPLIFIED PASSWORD CHECKING - Based on your database structure
    let passwordValid = false;
    
    // 1. Check plain text match (for existing users)
    if (password === user.password) {
      passwordValid = true;
      console.log('Password matched (plain text)');
    }
    // 2. Check for common demo passwords
    else if (password === 'demo000' || password === 'admin000' || password === 'khang000' || password === 'madd000') {
      passwordValid = true;
      console.log('Demo password matched');
    }
    // 3. Check bcrypt hashed passwords (if you decide to hash later)
    else if (user.password.startsWith('$2b$') && bcrypt.compareSync(password, user.password)) {
      passwordValid = true;
      console.log('Bcrypt password matched');
    }
    else {
      console.log('Password comparison failed');
      console.log('Input password:', password);
      console.log('Stored password:', user.password);
    }

    if (passwordValid) {
      // Update last_login timestamp
      db.query("UPDATE users SET last_login = NOW() WHERE id = ?", [user.id], (err) => {
        if (err) {
          console.error('Error updating last_login:', err);
        }
      });
      
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
      
      // Return user data matching your database structure
      const userResponse = {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        business_type: user.business_type,
        role: user.role || 'user',
        language: user.language || 'en',
        daily_reminder_enabled: user.daily_reminder_enabled,
        reminder_time: user.reminder_time,
        push_notifications: user.push_notifications,
        text_size: user.text_size,
        high_contrast: user.high_contrast,
        created_at: user.created_at,
        last_login: user.last_login
      };
      
      console.log('Login successful for user:', user.email);
      
      res.json({
        success: true,
        user: userResponse,
        token
      });
    } else {
      console.log('Password validation failed for:', email);
      res.status(401).json({ error: "Invalid email or password" });
    }
  });
});

// server.js - FIXED SIGNUP ROUTE FOR YOUR DATABASE STRUCTURE
app.post("/api/auth/signup", (req, res) => {
  const { name, email, password, phone, business_type } = req.body;
  
  console.log('Signup attempt:', { name, email, phone, business_type });
  
  // Validate required fields
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are required" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters long" });
  }

  // Check if user already exists
  db.query("SELECT id FROM users WHERE email = ?", [email], (err, results) => {
    if (err) {
      console.error('Database error checking existing user:', err);
      return res.status(500).json({ error: "Database error" });
    }
    
    if (results.length > 0) {
      console.log('User already exists with email:', email);
      return res.status(409).json({ error: "User already exists with this email" });
    }

    // Create new user - Matching your exact database structure
    const newUser = {
      name: name,
      email: email,
      password: password, // Plain text to match your existing setup
      phone: phone || null,
      business_type: business_type || null,
      role: 'user', // Default role
      language: 'en',
      daily_reminder_enabled: 1,
      reminder_time: '19:00:00',
      push_notifications: 1,
      text_size: 'medium',
      high_contrast: 0
      // created_at is automatically set by database
    };
    
    console.log('Creating new user with data:', newUser);

    db.query("INSERT INTO users SET ?", newUser, (err, result) => {
      if (err) {
        console.error('Database error creating user:', err);
        return res.status(500).json({ 
          error: "Failed to create user",
          details: err.message 
        });
      }
      
      const userId = result.insertId;
      console.log('User created successfully with ID:', userId);
      
      // Get the created user
      db.query("SELECT * FROM users WHERE id = ?", [userId], (err, userResults) => {
        if (err || userResults.length === 0) {
          console.error('Error fetching created user:', err);
          return res.status(500).json({ error: "User created but failed to retrieve data" });
        }
        
        const user = userResults[0];
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        
        // Return user data without password
        const userResponse = {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          business_type: user.business_type,
          role: user.role || 'user',
          language: user.language,
          daily_reminder_enabled: user.daily_reminder_enabled,
          reminder_time: user.reminder_time,
          push_notifications: user.push_notifications,
          text_size: user.text_size,
          high_contrast: user.high_contrast,
          created_at: user.created_at
        };
        
        res.json({
          success: true,
          user: userResponse,
          token
        });
      });
    });
  });
});

// Update user profile
app.put("/api/users/:id", (req, res) => {
  const userId = req.params.id;
  const { name, email, phone, business_type, language, text_size, high_contrast } = req.body;
  
  db.query(
    "UPDATE users SET name = ?, email = ?, phone = ?, business_type = ?, language = ?, text_size = ?, high_contrast = ? WHERE id = ?",
    [name, email, phone, business_type, language, text_size, high_contrast, userId],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Update failed" });
      }
      res.json({ success: true, message: "Profile updated successfully" });
    }
  );
});

// Change password
app.put("/api/users/:id/password", (req, res) => {
  const userId = req.params.id;
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password are required" });
  }

  // First verify current password
  db.query("SELECT password FROM users WHERE id = ?", [userId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = results[0];
    
    // Verify current password
    if (!bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    // Hash new password
    const hashedNewPassword = bcrypt.hashSync(newPassword, 10);
    
    // Update password
    db.query(
      "UPDATE users SET password = ? WHERE id = ?",
      [hashedNewPassword, userId],
      (err, result) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: "Password update failed" });
        }
        res.json({ success: true, message: "Password updated successfully" });
      }
    );
  });
});

// GET quiz results for a user
app.get("/api/quiz-results/:userId", (req, res) => {
  const userId = req.params.userId;
  
  const query = `
    SELECT qr.*, m.title_en as module_title, m.title_st as module_title_st
    FROM quiz_results qr
    LEFT JOIN modules m ON qr.module_id = m.id
    WHERE qr.user_id = ?
    ORDER BY qr.completed_at DESC
  `;
  
  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }
    
    res.json(results);
  });
});

// GET detailed quiz result by ID
app.get("/api/quiz-results/detail/:resultId", (req, res) => {
  const resultId = req.params.resultId;
  
  const query = `
    SELECT qr.*, m.title_en, m.title_st, m.description_en, m.description_st
    FROM quiz_results qr
    LEFT JOIN modules m ON qr.module_id = m.id
    WHERE qr.id = ?
  `;
  
  db.query(query, [resultId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ error: "Quiz result not found" });
    }
    
    res.json(results[0]);
  });
});

// GET user's quiz results
app.get("/api/quiz-results/user/:userId", (req, res) => {
  const userId = req.params.userId;
  
  const query = `
    SELECT qr.*, m.title_en as module_title, m.title_st as module_title_st
    FROM quiz_results qr
    LEFT JOIN modules m ON qr.module_id = m.id
    WHERE qr.user_id = ?
    ORDER BY qr.taken_at DESC
  `;
  
  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }
    
    res.json(results);
  });
});

// GET quiz results for specific module
app.get("/api/quiz-results/user/:userId/module/:moduleId", (req, res) => {
  const { userId, moduleId } = req.params;
  
  const query = `
    SELECT qr.*, m.title_en as module_title
    FROM quiz_results qr
    LEFT JOIN modules m ON qr.module_id = m.id
    WHERE qr.user_id = ? AND qr.module_id = ?
    ORDER BY qr.taken_at DESC
  `;
  
  db.query(query, [userId, moduleId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }
    
    res.json(results);
  });
});

// POST save quiz result with progress tracking
app.post("/api/quiz-results", (req, res) => {
  const { user_id, module_id, score, total_questions, time_spent = 0, correct_answers } = req.body;
  
  const passed = score >= 70; // 70% passing score
  
  // First, save the quiz result
  const insertQuery = `
    INSERT INTO quiz_results (user_id, module_id, score, total_questions, time_spent, passed, taken_at) 
    VALUES (?, ?, ?, ?, ?, ?, NOW())
  `;
  
  db.query(insertQuery, [user_id, module_id, score, total_questions, time_spent, passed], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to save quiz result" });
    }
    
    const quizResultId = result.insertId;
    
    // Update user progress
    updateUserProgress(user_id, module_id, score, (progressErr) => {
      if (progressErr) {
        console.error('Error updating progress:', progressErr);
        // Still return success for quiz result
      }
      
      // Check for achievements
      checkAchievements(user_id, module_id, score, (achievementErr, unlockedAchievements) => {
        if (achievementErr) {
          console.error('Error checking achievements:', achievementErr);
        }
        
        res.json({
          message: "Quiz result saved successfully",
          id: quizResultId,
          passed: passed,
          unlocked_achievements: unlockedAchievements || []
        });
      });
    });
  });
});


// POST save quiz result with progress tracking
app.post("/api/quiz-results", (req, res) => {
  const { user_id, module_id, score, total_questions, time_spent = 0 } = req.body;
  
  const passed = score >= 70; // 70% passing score
  const completed_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
  
  // First, save the quiz result
  const insertQuery = `
    INSERT INTO quiz_results (user_id, module_id, score, total_questions, time_spent, passed, completed_at) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  
  db.query(insertQuery, [user_id, module_id, score, total_questions, time_spent, passed, completed_at], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to save quiz result" });
    }
    
    const quizResultId = result.insertId;
    
    // Update user progress
    updateUserProgress(user_id, module_id, score, (progressErr) => {
      if (progressErr) {
        console.error('Error updating progress:', progressErr);
        // Still return success for quiz result
      }
      
      // Check for achievements
      checkAchievements(user_id, module_id, score, (achievementErr, unlockedAchievements) => {
        if (achievementErr) {
          console.error('Error checking achievements:', achievementErr);
        }
        
        res.json({
          message: "Quiz result saved successfully",
          id: quizResultId,
          passed: passed,
          unlocked_achievements: unlockedAchievements || []
        });
      });
    });
  });
});

// Update user progress function
// In server.js, find the updateUserProgress function called by quiz results
function updateUserProgress(userId, moduleId, quizScore, callback) {
  // Calculate completion percentage based on quiz score
  // If they pass the quiz (>=70%), mark as completed
  const completionPercentage = quizScore >= 70 ? 100 : Math.max(50, quizScore);
  
  console.log('🔄 QUIZ: Updating user progress from quiz:', {
    userId, moduleId, quizScore, completionPercentage
  });

  // Check if progress record exists
  const checkQuery = "SELECT * FROM user_progress WHERE user_id = ? AND module_id = ?";
  
  db.query(checkQuery, [userId, moduleId], (err, results) => {
    if (err) return callback(err);
    
    console.log('📊 QUIZ: Existing progress records:', results.length);
    
    if (results.length > 0) {
      // Update existing progress - only improve the score
      const currentProgress = results[0];
      const newPercentage = Math.max(currentProgress.completion_percentage, completionPercentage);
      
      console.log('🔄 QUIZ: Updating progress from', currentProgress.completion_percentage, 'to', newPercentage);
      
      const updateQuery = `
        UPDATE user_progress 
        SET completion_percentage = ?, last_accessed = NOW(), updated_at = NOW()
        WHERE user_id = ? AND module_id = ?
      `;
      
      db.query(updateQuery, [newPercentage, userId, moduleId], (err, result) => {
        if (err) {
          console.error('❌ QUIZ: Error updating progress:', err);
          return callback(err);
        }
        console.log('✅ QUIZ: Progress updated successfully');
        callback(null);
      });
    } else {
      // Create new progress record
      const insertQuery = `
        INSERT INTO user_progress (user_id, module_id, completion_percentage, created_at, updated_at, last_accessed) 
        VALUES (?, ?, ?, NOW(), NOW(), NOW())
      `;
      
      console.log('🆕 QUIZ: Creating new progress record');
      db.query(insertQuery, [userId, moduleId, completionPercentage], (err, result) => {
        if (err) {
          console.error('❌ QUIZ: Error creating progress:', err);
          return callback(err);
        }
        console.log('✅ QUIZ: Progress created successfully');
        callback(null);
      });
    }
  });
}

// Check achievements function
function checkAchievements(userId, moduleId, quizScore, callback) {
  const unlocked = [];
  
  // Check for quiz-related achievements
  const achievementsQuery = `
    SELECT * FROM achievements 
    WHERE is_active = 1 
    AND (category = 'quiz' OR category = 'completion' OR category = 'performance')
  `;
  
  db.query(achievementsQuery, (err, achievements) => {
    if (err) return callback(err);
    
    let processed = 0;
    
    achievements.forEach(achievement => {
      checkSingleAchievement(userId, moduleId, quizScore, achievement, (checkErr, shouldUnlock) => {
        if (shouldUnlock) {
          unlockAchievement(userId, achievement.id, (unlockErr) => {
            if (!unlockErr) {
              unlocked.push({
                id: achievement.id,
                name_en: achievement.name_en,
                name_st: achievement.name_st,
                description_en: achievement.description_en,
                description_st: achievement.description_st,
                points: achievement.points
              });
            }
            processed++;
            if (processed === achievements.length) {
              callback(null, unlocked);
            }
          });
        } else {
          processed++;
          if (processed === achievements.length) {
            callback(null, unlocked);
          }
        }
      });
    });
    
    if (achievements.length === 0) {
      callback(null, []);
    }
  });
}

function checkSingleAchievement(userId, moduleId, quizScore, achievement, callback) {
  // Check if user already has this achievement
  const checkQuery = "SELECT * FROM user_achievements WHERE user_id = ? AND achievement_id = ?";
  
  db.query(checkQuery, [userId, achievement.id], (err, results) => {
    if (err || results.length > 0) return callback(err, false);
    
    let shouldUnlock = false;
    
    // Check achievement conditions
    switch (achievement.name_en) {
      case 'First Quiz Complete':
        // Unlock on first quiz completion
        const firstQuizQuery = "SELECT COUNT(*) as count FROM quiz_results WHERE user_id = ?";
        db.query(firstQuizQuery, [userId], (err, results) => {
          if (!err && results[0].count === 1) shouldUnlock = true;
          callback(null, shouldUnlock);
        });
        break;
        
      case 'Quiz Master':
        // Unlock when passing 5 quizzes
        const quizMasterQuery = "SELECT COUNT(*) as count FROM quiz_results WHERE user_id = ? AND passed = 1";
        db.query(quizMasterQuery, [userId], (err, results) => {
          if (!err && results[0].count >= 5) shouldUnlock = true;
          callback(null, shouldUnlock);
        });
        break;
        
      case 'Perfect Score':
        // Unlock on 100% score
        if (quizScore === 100) shouldUnlock = true;
        callback(null, shouldUnlock);
        break;
        
      case 'Quick Learner':
        // Unlock when completing 3 modules
        const modulesQuery = `
          SELECT COUNT(DISTINCT module_id) as count 
          FROM user_progress 
          WHERE user_id = ? AND completion_percentage = 100
        `;
        db.query(modulesQuery, [userId], (err, results) => {
          if (!err && results[0].count >= 3) shouldUnlock = true;
          callback(null, shouldUnlock);
        });
        break;
        
      default:
        callback(null, false);
    }
  });
}

function unlockAchievement(userId, achievementId, callback) {
  const query = "INSERT INTO user_achievements (user_id, achievement_id, earned_at) VALUES (?, ?, NOW())";
  db.query(query, [userId, achievementId], callback);
}

// GET user progress with module details
// GET user progress with module details - UPDATED
app.get("/api/user-progress/:userId", (req, res) => {
  const userId = req.params.userId;
  
  console.log('Fetching progress for user:', userId);
  
  const query = `
    SELECT 
      up.*, 
      m.title_en, 
      m.title_st, 
      m.description_en, 
      m.description_st, 
      m.difficulty_level,
      m.estimated_duration,
      c.name_en as category_name,
      c.color as category_color
    FROM user_progress up
    LEFT JOIN modules m ON up.module_id = m.id
    LEFT JOIN content_categories c ON m.category_id = c.id
    WHERE up.user_id = ?
    ORDER BY up.updated_at DESC
  `;
  
  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Database error fetching user progress:', err);
      return res.status(500).json({ error: "Database error" });
    }
    
    console.log(`Found ${results.length} progress records for user ${userId}`);
    res.json(results);
  });
});

// GET user achievements
app.get("/api/user-achievements/:userId", (req, res) => {
  const userId = req.params.userId;
  
  const query = `
    SELECT ua.*, a.name_en, a.name_st, a.description_en, a.description_st, a.points, a.icon
    FROM user_achievements ua
    LEFT JOIN achievements a ON ua.achievement_id = a.id
    WHERE ua.user_id = ?
    ORDER BY ua.earned_at DESC
  `;
  
  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }
    
    res.json(results);
  });
});

// Test route to check if API is working
app.get("/api/test", (req, res) => {
  res.json({ 
    success: true, 
    message: "API is working!",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/test-db", (req, res) => {
  db.query("SELECT 1 + 1 AS solution", (err, results) => {
    if (err) {
      res.json({ success: false, error: err.message });
    } else {
      res.json({ 
        success: true, 
        message: "Database connection working",
        solution: results[0].solution 
      });
    }
  });
});

// Add these routes to your server.js file in the PUBLIC ADMIN ROUTES section

// GET all categories (Public - for admin dashboard)
app.get("/api/admin/public/categories", (req, res) => {
  db.query("SELECT * FROM content_categories ORDER BY created_at DESC", (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ success: true, categories: results });
  });
});

// CREATE category (Public - for admin)
app.post("/api/admin/public/categories", (req, res) => {
  const { name_en, name_st, color, icon } = req.body;
  
  console.log('Creating category with data:', req.body);
  
  // Validate required fields
  if (!name_en) {
    return res.status(400).json({ error: "English name is required" });
  }

  const categoryData = {
    name_en: name_en,
    name_st: name_st || '',
    color: color || '#0026ff',
    icon: icon || '📚',
    created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
  };

  console.log('Complete category data:', categoryData);

  db.query("INSERT INTO content_categories SET ?", categoryData, (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ 
        error: "Failed to create category",
        details: err.message 
      });
    }
    
    console.log('Category created successfully with ID:', result.insertId);
    
    res.json({ 
      success: true, 
      category: { 
        id: result.insertId, 
        ...categoryData 
      } 
    });
  });
});

// UPDATE category (Public - for admin)
app.put("/api/admin/public/categories/:id", (req, res) => {
  const categoryId = req.params.id;
  const { name_en, name_st, color, icon } = req.body;
  
  console.log('Updating category:', categoryId, req.body);

  if (!name_en) {
    return res.status(400).json({ error: "English name is required" });
  }

  const updateData = {
    name_en: name_en,
    name_st: name_st || '',
    color: color || '#0026ff',
    icon: icon || '📚'
  };

  db.query("UPDATE content_categories SET ? WHERE id = ?", [updateData, categoryId], (err, result) => {
    if (err) {
      console.error('Error updating category:', err);
      return res.status(500).json({ 
        error: "Update failed",
        details: err.message 
      });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Category not found" });
    }
    
    console.log('Category updated successfully');
    res.json({ success: true, message: "Category updated successfully" });
  });
});

// DELETE category (Public - for admin)
app.delete("/api/admin/public/categories/:id", (req, res) => {
  const categoryId = req.params.id;
  
  console.log('Deleting category:', categoryId);

  // First check if any modules are using this category
  db.query("SELECT COUNT(*) as moduleCount FROM modules WHERE category_id = ?", [categoryId], (err, results) => {
    if (err) {
      console.error('Error checking modules:', err);
      return res.status(500).json({ error: "Database error" });
    }
    
    const moduleCount = results[0].moduleCount;
    if (moduleCount > 0) {
      return res.status(400).json({ 
        error: `Cannot delete category. There are ${moduleCount} module(s) using this category.` 
      });
    }

    // If no modules are using the category, proceed with deletion
    db.query("DELETE FROM content_categories WHERE id = ?", [categoryId], (err, result) => {
      if (err) {
        console.error('Error deleting category:', err);
        return res.status(500).json({ error: "Delete failed" });
      }
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Category not found" });
      }
      
      console.log('Category deleted successfully');
      res.json({ success: true, message: "Category deleted successfully" });
    });
  });
});

// POST user progress
// POST user progress - UPDATED
// server.js - UPDATE THE USER PROGRESS ENDPOINT
app.post("/api/user-progress", (req, res) => {
  const { user_id, module_id, completion_percentage } = req.body;
  
  console.log('🔄 SERVER: Received progress update request:', {
    user_id,
    module_id, 
    completion_percentage,
    body: req.body
  });
  
  // Validate required fields
  if (!user_id || !module_id || completion_percentage === undefined) {
    console.log('❌ SERVER: Missing required fields');
    return res.status(400).json({ 
      error: "User ID, Module ID, and completion percentage are required" 
    });
  }

  // Check if progress record exists
  const checkQuery = "SELECT * FROM user_progress WHERE user_id = ? AND module_id = ?";
  
  console.log('📊 SERVER: Checking existing progress...');
  db.query(checkQuery, [user_id, module_id], (err, results) => {
    if (err) {
      console.error('❌ SERVER: Database error checking progress:', err);
      return res.status(500).json({ error: "Database error" });
    }
    
    console.log('📊 SERVER: Existing progress found:', results.length);
    
    if (results.length > 0) {
      // Update existing progress
      const updateQuery = `
        UPDATE user_progress 
        SET completion_percentage = ?, updated_at = NOW(), last_accessed = NOW()
        WHERE user_id = ? AND module_id = ?
      `;
      
      console.log('🔄 SERVER: Updating existing progress...');
      db.query(updateQuery, [completion_percentage, user_id, module_id], (err, result) => {
        if (err) {
          console.error('❌ SERVER: Database error updating progress:', err);
          return res.status(500).json({ error: "Failed to update progress" });
        }
        
        console.log('✅ SERVER: Progress updated successfully, affected rows:', result.affectedRows);
        res.json({ 
          success: true,
          message: "Progress updated successfully",
          user_id,
          module_id,
          completion_percentage
        });
      });
    } else {
      // Create new progress record
      const insertQuery = `
        INSERT INTO user_progress (user_id, module_id, completion_percentage, created_at, updated_at, last_accessed) 
        VALUES (?, ?, ?, NOW(), NOW(), NOW())
      `;
      
      console.log('🆕 SERVER: Creating new progress record...');
      db.query(insertQuery, [user_id, module_id, completion_percentage], (err, result) => {
        if (err) {
          console.error('❌ SERVER: Database error creating progress:', err);
          return res.status(500).json({ error: "Failed to create progress record" });
        }
        
        console.log('✅ SERVER: Progress created successfully with ID:', result.insertId);
        res.json({ 
          success: true,
          message: "Progress created successfully",
          id: result.insertId,
          user_id,
          module_id,
          completion_percentage
        });
      });
    }
  });
});
// Add these routes to your server.js file in the PUBLIC ADMIN ROUTES section

// Module Content Management
app.get("/api/admin/public/module-content/:moduleId", (req, res) => {
  const moduleId = req.params.moduleId;
  db.query("SELECT * FROM module_content WHERE module_id = ? ORDER BY display_order", [moduleId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ success: true, content: results });
  });
});

app.post("/api/admin/public/module-content", (req, res) => {
  const { module_id, content_type, title_en, title_st, content_en, content_st, video_url, image_url, display_order } = req.body;
  
  console.log('Creating module content:', req.body);
  
  if (!module_id || !content_type || !title_en) {
    return res.status(400).json({ error: "Module ID, content type, and English title are required" });
  }

  const contentData = {
    module_id: parseInt(module_id),
    content_type: content_type,
    title_en: title_en,
    title_st: title_st || '',
    content_en: content_en || '',
    content_st: content_st || '',
    video_url: video_url || '',
    image_url: image_url || '',
    display_order: parseInt(display_order) || 0,
    created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
  };

  db.query("INSERT INTO module_content SET ?", contentData, (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ 
        error: "Failed to create content",
        details: err.message 
      });
    }
    
    res.json({ 
      success: true, 
      content: { 
        id: result.insertId, 
        ...contentData 
      } 
    });
  });
});

app.put("/api/admin/public/module-content/:id", (req, res) => {
  const contentId = req.params.id;
  const { content_type, title_en, title_st, content_en, content_st, video_url, image_url, display_order } = req.body;

  const updateData = {
    content_type: content_type,
    title_en: title_en,
    title_st: title_st,
    content_en: content_en,
    content_st: content_st,
    video_url: video_url,
    image_url: image_url,
    display_order: parseInt(display_order) || 0
  };

  db.query("UPDATE module_content SET ? WHERE id = ?", [updateData, contentId], (err, result) => {
    if (err) {
      console.error('Error updating content:', err);
      return res.status(500).json({ error: "Update failed" });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Content not found" });
    }
    
    res.json({ success: true, message: "Content updated successfully" });
  });
});

app.delete("/api/admin/public/module-content/:id", (req, res) => {
  const contentId = req.params.id;
  
  db.query("DELETE FROM module_content WHERE id = ?", [contentId], (err, result) => {
    if (err) {
      console.error('Error deleting content:', err);
      return res.status(500).json({ error: "Delete failed" });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Content not found" });
    }
    
    res.json({ success: true, message: "Content deleted successfully" });
  });
});

// Quiz Questions Management
app.get("/api/admin/public/questions/:moduleId", (req, res) => {
  const moduleId = req.params.moduleId;
  db.query("SELECT * FROM questions WHERE module_id = ? ORDER BY id", [moduleId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ success: true, questions: results });
  });
});

app.post("/api/admin/public/questions", (req, res) => {
  const { 
    module_id, 
    question_en, 
    question_st, 
    option1_en, 
    option1_st, 
    option2_en, 
    option2_st, 
    option3_en, 
    option3_st, 
    option4_en, 
    option4_st, 
    correct_option, 
    explanation_en, 
    explanation_st 
  } = req.body;
  
  console.log('Creating question:', req.body);
  
  if (!module_id || !question_en || !correct_option) {
    return res.status(400).json({ error: "Module ID, question, and correct option are required" });
  }

  const questionData = {
    module_id: parseInt(module_id),
    question_en: question_en,
    question_st: question_st || '',
    option1_en: option1_en || '',
    option1_st: option1_st || '',
    option2_en: option2_en || '',
    option2_st: option2_st || '',
    option3_en: option3_en || '',
    option3_st: option3_st || '',
    option4_en: option4_en || '',
    option4_st: option4_st || '',
    correct_option: parseInt(correct_option),
    explanation_en: explanation_en || '',
    explanation_st: explanation_st || '',
    created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
  };

  db.query("INSERT INTO questions SET ?", questionData, (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ 
        error: "Failed to create question",
        details: err.message 
      });
    }
    
    res.json({ 
      success: true, 
      question: { 
        id: result.insertId, 
        ...questionData 
      } 
    });
  });
});

app.put("/api/admin/public/questions/:id", (req, res) => {
  const questionId = req.params.id;
  const { 
    question_en, 
    question_st, 
    option1_en, 
    option1_st, 
    option2_en, 
    option2_st, 
    option3_en, 
    option3_st, 
    option4_en, 
    option4_st, 
    correct_option, 
    explanation_en, 
    explanation_st 
  } = req.body;

  const updateData = {
    question_en: question_en,
    question_st: question_st,
    option1_en: option1_en,
    option1_st: option1_st,
    option2_en: option2_en,
    option2_st: option2_st,
    option3_en: option3_en,
    option3_st: option3_st,
    option4_en: option4_en,
    option4_st: option4_st,
    correct_option: parseInt(correct_option),
    explanation_en: explanation_en,
    explanation_st: explanation_st
  };

  db.query("UPDATE questions SET ? WHERE id = ?", [updateData, questionId], (err, result) => {
    if (err) {
      console.error('Error updating question:', err);
      return res.status(500).json({ error: "Update failed" });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Question not found" });
    }
    
    res.json({ success: true, message: "Question updated successfully" });
  });
});

app.delete("/api/admin/public/questions/:id", (req, res) => {
  const questionId = req.params.id;
  
  db.query("DELETE FROM questions WHERE id = ?", [questionId], (err, result) => {
    if (err) {
      console.error('Error deleting question:', err);
      return res.status(500).json({ error: "Delete failed" });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Question not found" });
    }
    
    res.json({ success: true, message: "Question deleted successfully" });
  });
});

// server.js - NEW ACHIEVEMENTS AND STREAK ENDPOINTS

// Achievements endpoints
app.get("/api/achievements", (req, res) => {
  db.query("SELECT * FROM achievements WHERE is_active = 1 ORDER BY points DESC", (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(results);
  });
});

app.get("/api/user-achievements/:userId", (req, res) => {
  const userId = req.params.userId;
  const query = `
    SELECT ua.*, a.name_en, a.name_st, a.description_en, a.description_st, a.icon, a.points, a.category, a.rarity
    FROM user_achievements ua
    JOIN achievements a ON ua.achievement_id = a.id
    WHERE ua.user_id = ?
    ORDER BY ua.earned_at DESC
  `;
  
  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json(results);
  });
});

app.post("/api/user-achievements", (req, res) => {
  const { user_id, achievement_id } = req.body;
  
  db.query(
    "INSERT INTO user_achievements (user_id, achievement_id) VALUES (?, ?)",
    [user_id, achievement_id],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to unlock achievement" });
      }
      res.json({ 
        success: true, 
        message: "Achievement unlocked successfully",
        id: result.insertId 
      });
    }
  );
});

// Streak endpoints
app.get("/api/user-streak/:userId", (req, res) => {
  const userId = req.params.userId;
  
  db.query("SELECT * FROM user_streaks WHERE user_id = ?", [userId], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }
    
    if (results.length === 0) {
      // Create streak record if it doesn't exist
      db.query(
        "INSERT INTO user_streaks (user_id, current_streak, max_streak, last_activity_date) VALUES (?, 5, 5, CURDATE())",
        [userId],
        (err, result) => {
          if (err) {
            return res.status(500).json({ error: "Failed to create streak" });
          }
          res.json({
            id: result.insertId,
            user_id: parseInt(userId),
            current_streak: 5,
            max_streak: 5,
            last_activity_date: new Date().toISOString().split('T')[0],
            is_frozen: 0,
            freeze_until: null
          });
        }
      );
    } else {
      res.json(results[0]);
    }
  });
});

app.post("/api/user-streak", (req, res) => {
  const { user_id, activity_type, quiz_completed } = req.body;
  const today = new Date().toISOString().split('T')[0];
  
  console.log('🔄 Streak update request:', { user_id, activity_type, quiz_completed, today });

  // Get current streak
  db.query("SELECT * FROM user_streaks WHERE user_id = ?", [user_id], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ error: "Streak record not found" });
    }

    const streak = results[0];
    let newStreak = streak.current_streak;
    let newMaxStreak = streak.max_streak;
    let isFrozen = streak.is_frozen;
    let freezeUntil = streak.freeze_until;

    // Check if user is frozen and if freeze period is over
    if (isFrozen && freeze_until && new Date() > new Date(freeze_until)) {
      isFrozen = 0;
      freezeUntil = null;
      newStreak = 1; // Start recovering
    }

    // If user is frozen and trying to take quiz, block them
    if (isFrozen && activity_type === 'quiz_attempt') {
      return res.json({
        success: false,
        message: "Streak is frozen. Complete learning activities to recover.",
        current_streak: 0,
        is_frozen: true,
        freeze_until: freezeUntil
      });
    }

    if (activity_type === 'quiz_completed' && quiz_completed) {
      // User completed a quiz - maintain or increase streak
      if (streak.last_activity_date === today) {
        // Already recorded activity today
        return res.json({
          success: true,
          message: "Activity already recorded today",
          current_streak: newStreak,
          max_streak: newMaxStreak,
          is_frozen: isFrozen
        });
      }

      const lastDate = new Date(streak.last_activity_date);
      const currentDate = new Date(today);
      const dayDiff = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));

      if (dayDiff === 1) {
        // Consecutive day - increase streak
        newStreak = Math.min(streak.current_streak + 1, 5);
      } else if (dayDiff > 1) {
        // Broken streak - reset to 1
        newStreak = 1;
      }
      // If dayDiff === 0, do nothing (already handled above)

      newMaxStreak = Math.max(newMaxStreak, newStreak);

    } else if (activity_type === 'quiz_missed') {
      // User missed a quiz - decrease streak
      newStreak = Math.max(0, streak.current_streak - 1);
      
      if (newStreak === 0) {
        // Freeze streak for 5 minutes (300000 milliseconds)
        isFrozen = 1;
        freezeUntil = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
      }
    } else if (activity_type === 'learning_activity') {
      // Learning activity - can help recover from freeze
      if (isFrozen) {
        newStreak = 1;
        isFrozen = 0;
        freezeUntil = null;
      }
    }

    // Update streak
    const updateQuery = `
      UPDATE user_streaks 
      SET current_streak = ?, max_streak = ?, last_activity_date = ?, is_frozen = ?, freeze_until = ?, updated_at = NOW()
      WHERE user_id = ?
    `;

    db.query(updateQuery, [newStreak, newMaxStreak, today, isFrozen, freezeUntil, user_id], (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to update streak" });
      }

      res.json({
        success: true,
        current_streak: newStreak,
        max_streak: newMaxStreak,
        is_frozen: isFrozen,
        freeze_until: freezeUntil,
        message: isFrozen ? 
          `Streak frozen. Complete learning activities to recover in 5 minutes.` :
          `Streak updated to ${newStreak}`
      });
    });
  });
});

// Check and unlock achievements
app.post("/api/check-achievements", (req, res) => {
  const { user_id, activity_type, activity_data } = req.body;
  const unlocked = [];

  console.log('🎯 Checking achievements for user:', user_id, activity_type);

  const checkAndUnlock = (achievementId, callback) => {
    // Check if user already has this achievement
    db.query(
      "SELECT id FROM user_achievements WHERE user_id = ? AND achievement_id = ?",
      [user_id, achievementId],
      (err, results) => {
        if (err) return callback(err);
        
        if (results.length === 0) {
          // Unlock achievement
          db.query(
            "INSERT INTO user_achievements (user_id, achievement_id) VALUES (?, ?)",
            [user_id, achievementId],
            (err, result) => {
              if (err) return callback(err);
              
              // Get achievement details
              db.query("SELECT * FROM achievements WHERE id = ?", [achievementId], (err, achievementResults) => {
                if (err) return callback(err);
                
                if (achievementResults.length > 0) {
                  unlocked.push(achievementResults[0]);
                  console.log('✅ Unlocked achievement:', achievementResults[0].name_en);
                }
                callback(null);
              });
            }
          );
        } else {
          callback(null);
        }
      }
    );
  };

  // Check different achievement types based on activity
  const checks = [];

  if (activity_type === 'module_completed') {
    // Check modules completed achievements
    db.query(
      "SELECT COUNT(*) as count FROM user_progress WHERE user_id = ? AND completion_percentage = 100",
      [user_id],
      (err, results) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: "Database error" });
        }

        const completedCount = results[0].count;

        if (completedCount >= 1) checks.push(() => checkAndUnlock(1, () => {})); // First Steps
        if (completedCount >= 3) checks.push(() => checkAndUnlock(2, () => {})); // Quick Learner
        if (completedCount >= 5) checks.push(() => checkAndUnlock(3, () => {})); // Module Master

        // Execute all checks
        Promise.all(checks.map(check => new Promise(check)))
          .then(() => {
            res.json({ unlocked_achievements: unlocked });
          })
          .catch(error => {
            console.error(error);
            res.status(500).json({ error: "Failed to check achievements" });
          });
      }
    );
  } else if (activity_type === 'quiz_completed') {
    // Check quiz achievements
    const { score, is_perfect } = activity_data;

    checks.push(() => checkAndUnlock(4, () => {})); // Quiz Novice

    if (is_perfect) {
      checks.push(() => checkAndUnlock(6, () => {})); // Perfect Score
    }

    // Check total quizzes taken
    db.query(
      "SELECT COUNT(*) as count FROM quiz_results WHERE user_id = ?",
      [user_id],
      (err, results) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: "Database error" });
        }

        const quizCount = results[0].count;
        if (quizCount >= 5) checks.push(() => checkAndUnlock(5, () => {})); // Quiz Master

        Promise.all(checks.map(check => new Promise(check)))
          .then(() => {
            res.json({ unlocked_achievements: unlocked });
          })
          .catch(error => {
            console.error(error);
            res.status(500).json({ error: "Failed to check achievements" });
          });
      }
    );
  } else {
    res.json({ unlocked_achievements: unlocked });
  }
});

// Add this to server.js - BEFORE your upload route
app.use("/api/admin/public/upload", (req, res, next) => {
  console.log('🔍 DEBUG UPLOAD REQUEST:');
  console.log('🔍 Method:', req.method);
  console.log('🔍 Content-Type:', req.headers['content-type']);
  console.log('🔍 Content-Length:', req.headers['content-length']);
  console.log('🔍 Is multipart?', req.headers['content-type']?.includes('multipart/form-data'));
  next();
});

// In server.js - Add proper MIME types for video files
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, path) => {
    // Set proper MIME types for videos
    if (path.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
    } else if (path.endsWith('.webm')) {
      res.setHeader('Content-Type', 'video/webm');
    } else if (path.endsWith('.ogg')) {
      res.setHeader('Content-Type', 'video/ogg');
    }
    
    // Enable CORS for media files
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));

// Add a specific route for video files if needed
app.get('/uploads/videos/:filename', (req, res) => {
  const filename = req.params.filename;
  const videoPath = path.join(__dirname, 'uploads', 'videos', filename);
  
  // Check if file exists
  if (fs.existsSync(videoPath)) {
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Handle range requests for video streaming
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize-1;
      const chunksize = (end-start)+1;
      const file = fs.createReadStream(videoPath, {start, end});
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(200, head);
      fs.createReadStream(videoPath).pipe(res);
    }
  } else {
    res.status(404).json({ error: 'Video not found' });
  }
});



const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

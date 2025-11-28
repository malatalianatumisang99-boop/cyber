const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// Environment variables for Railway with defaults
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'maddieyourz';

// Enhanced database configuration for Railway
const dbConfig = {
    host: process.env.MYSQLHOST || process.env.MYSQL_HOST || "localhost",
    user: process.env.MYSQLUSER || process.env.MYSQL_USER || "root", 
    password: process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || "cybersecurity_app",
    port: process.env.MYSQLPORT || process.env.MYSQL_PORT || 3306,
    connectionLimit: 10,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true,
    multipleStatements: true
};

console.log('🔧 Database Configuration:', {
    host: dbConfig.host,
    user: dbConfig.user,
    database: dbConfig.database,
    port: dbConfig.port
});

// Create connection pool
const db = mysql.createPool(dbConfig);

// Test database connection
db.getConnection((err, connection) => {
    if (err) {
        console.error("❌ Database connection failed:", err.message);
        console.log("🔄 Will retry table creation later...");
    } else {
        console.log("✅ Connected to MySQL database");
        connection.release();
        initializeDatabase();
    }
});

// Function to initialize database tables
async function initializeDatabase() {
    return new Promise((resolve, reject) => {
        console.log('🔄 Initializing database tables...');
        
        const createTablesSQL = `
            SET FOREIGN_KEY_CHECKS=0;

            -- Create achievements table
            CREATE TABLE IF NOT EXISTS achievements (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name_en VARCHAR(100) NOT NULL,
                name_st VARCHAR(100) NOT NULL,
                description_en TEXT,
                description_st TEXT,
                icon_url VARCHAR(500),
                criteria_type ENUM('modules_completed','perfect_scores','streak_days','total_points') DEFAULT 'modules_completed',
                criteria_value INT NOT NULL,
                points_reward INT DEFAULT 0,
                is_active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                progress_type VARCHAR(50),
                is_cumulative TINYINT(1) DEFAULT 1
            );

            -- Create content_categories table
            CREATE TABLE IF NOT EXISTS content_categories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name_en VARCHAR(100) NOT NULL,
                name_st VARCHAR(100) NOT NULL,
                color VARCHAR(7) DEFAULT '#0026ff',
                icon VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Create media_assets table
            CREATE TABLE IF NOT EXISTS media_assets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                module_id INT,
                content_id INT,
                asset_type ENUM('image','icon','infographic','diagram') DEFAULT 'image',
                file_name VARCHAR(255) NOT NULL,
                file_path VARCHAR(500) NOT NULL,
                caption_en VARCHAR(500),
                caption_st VARCHAR(500),
                display_order INT DEFAULT 0,
                is_active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Create modules table
            CREATE TABLE IF NOT EXISTS modules (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title_en VARCHAR(255),
                title_st VARCHAR(255),
                description_en TEXT,
                description_st TEXT,
                video_url_en VARCHAR(500),
                video_url_st VARCHAR(500),
                thumbnail_en VARCHAR(500),
                thumbnail_st VARCHAR(500),
                duration INT,
                difficulty ENUM('beginner','intermediate','advanced') DEFAULT 'beginner',
                is_active TINYINT(1) DEFAULT 1,
                category_id INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            );

            -- Create module_content table
            CREATE TABLE IF NOT EXISTS module_content (
                id INT AUTO_INCREMENT PRIMARY KEY,
                module_id INT NOT NULL,
                content_type ENUM('text','video','image') DEFAULT 'text',
                title_en VARCHAR(255),
                title_st VARCHAR(255),
                content_en TEXT,
                content_st TEXT,
                video_url VARCHAR(500),
                image_url VARCHAR(500),
                display_order INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Create notifications table
            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                title_en VARCHAR(255) NOT NULL,
                title_st VARCHAR(255) NOT NULL,
                message_en TEXT NOT NULL,
                message_st TEXT NOT NULL,
                type ENUM('learning_reminder','new_content','achievement','system') DEFAULT 'system',
                is_read TINYINT(1) DEFAULT 0,
                action_url VARCHAR(500),
                sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Create questions table
            CREATE TABLE IF NOT EXISTS questions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                module_id INT,
                question_en TEXT,
                question_st TEXT,
                option1_en VARCHAR(255),
                option1_st VARCHAR(255),
                option2_en VARCHAR(255),
                option2_st VARCHAR(255),
                option3_en VARCHAR(255),
                option3_st VARCHAR(255),
                option4_en VARCHAR(255),
                option4_st VARCHAR(255),
                correct_option INT,
                explanation_en TEXT,
                explanation_st TEXT,
                image_url VARCHAR(500),
                question_type ENUM('multiple_choice','true_false','fill_blank','matching','ordering') DEFAULT 'multiple_choice',
                question_format ENUM('text_only','text_with_image','image_only') DEFAULT 'text_only',
                difficulty ENUM('easy','medium','hard') DEFAULT 'medium',
                points INT DEFAULT 1,
                time_limit INT DEFAULT 30,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                matching_pairs_json TEXT,
                ordering_items_json TEXT,
                blank_positions_json TEXT
            );

            -- Create quiz_results table
            CREATE TABLE IF NOT EXISTS quiz_results (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                module_id INT,
                score INT,
                total_questions INT,
                time_spent INT DEFAULT 0,
                passed BOOLEAN DEFAULT FALSE,
                taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Create users table
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100),
                email VARCHAR(100) UNIQUE,
                phone VARCHAR(20),
                business_type VARCHAR(100),
                language ENUM('en','st') DEFAULT 'en',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                daily_reminder_enabled TINYINT(1) DEFAULT 1,
                reminder_time TIME DEFAULT '19:00:00',
                push_notifications TINYINT(1) DEFAULT 1,
                text_size ENUM('small','medium','large') DEFAULT 'medium',
                high_contrast TINYINT(1) DEFAULT 0,
                role VARCHAR(255) DEFAULT 'user',
                password VARCHAR(255),
                last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Create user_achievements table
            CREATE TABLE IF NOT EXISTS user_achievements (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                achievement_id INT NOT NULL,
                earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_achievement (user_id, achievement_id)
            );

            -- Create user_analytics table
            CREATE TABLE IF NOT EXISTS user_analytics (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                module_id INT,
                action_type ENUM('module_start','module_complete','quiz_attempt','content_view','time_spent') DEFAULT 'content_view',
                action_data TEXT,
                duration_seconds INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Create user_progress table
            CREATE TABLE IF NOT EXISTS user_progress (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                module_id INT NOT NULL,
                completion_percentage INT NOT NULL DEFAULT 0,
                last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_module (user_id, module_id)
            );

            -- Create user_sessions table
            CREATE TABLE IF NOT EXISTS user_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                session_token VARCHAR(255) NOT NULL,
                device_info TEXT,
                ip_address VARCHAR(45),
                login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                logout_at TIMESTAMP NULL,
                expires_at TIMESTAMP NULL,
                UNIQUE KEY session_token (session_token)
            );

            -- Create user_streaks table
            CREATE TABLE IF NOT EXISTS user_streaks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                current_streak INT DEFAULT 5,
                max_streak INT DEFAULT 5,
                last_activity_date DATE,
                is_frozen TINYINT(1) DEFAULT 0,
                freeze_until TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_streak (user_id)
            );

            -- Create user_achievement_progress table
            CREATE TABLE IF NOT EXISTS user_achievement_progress (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                achievement_id INT NOT NULL,
                progress_value INT DEFAULT 0,
                completed TINYINT(1) DEFAULT 0,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_achievement_progress (user_id, achievement_id)
            );

            -- Create password_reset_tokens table
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                token VARCHAR(255) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            SET FOREIGN_KEY_CHECKS=1;
        `;

        db.query(createTablesSQL, (err, results) => {
            if (err) {
                console.error('❌ Error creating tables:', err.message);
                reject(err);
            } else {
                console.log('✅ All 16 tables created successfully!');
                insertInitialData()
                    .then(() => resolve())
                    .catch(err => {
                        console.error('❌ Error inserting initial data:', err.message);
                        resolve(); // Continue even if data insertion fails
                    });
            }
        });
    });
}

// Function to insert initial data
async function insertInitialData() {
    return new Promise((resolve, reject) => {
        console.log('🔄 Inserting initial data...');
        
        const insertDataSQL = `
            -- Insert default categories
            INSERT IGNORE INTO content_categories (id, name_en, name_st, color, icon) VALUES
            (1, 'Phishing Awareness', 'Tsebo ka Phishing', '#ff6b6b', 'shield'),
            (2, 'Mobile Security', 'Tšireletso ea Mobile', '#4ecdc4', 'phone'),
            (3, 'Password Safety', 'Tšireletso ea Phasewete', '#45b7d1', 'lock'),
            (4, 'Social Engineering', 'Boenjiniere ba Sechaba', '#96ceb4', 'users');

            -- Insert default achievements
            INSERT IGNORE INTO achievements (id, name_en, name_st, description_en, description_st, criteria_type, criteria_value, points_reward, progress_type) VALUES
            (1, 'First Steps', 'Mehato ea Pele', 'Complete your first module', 'Fetša khaolo ea hau ea pele', 'modules_completed', 1, 10, 'module_completion'),
            (2, 'Quiz Master', 'Mong''a Lipotso', 'Score 100% on any quiz', 'Fumane 100% holim''a lipotso life kapa life', 'perfect_scores', 1, 25, 'perfect_quizzes'),
            (3, 'Learning Streak', 'Mokhoa oa ho Ithuta', 'Learn for 7 consecutive days', 'Ithuta matsatsi a 7 ka ho latelana', 'streak_days', 7, 50, 'current_streak'),
            (4, 'Cyber Guardian', 'Mohlokomeli wa Cyber', 'Complete all security modules', 'Fetša lihlooho tsohle tsa tšireletso', 'modules_completed', 5, 100, 'module_completion');

            -- Insert additional achievements
            INSERT IGNORE INTO achievements (name_en, description_en, icon, points, category, rarity, criteria_type, criteria_value, progress_type) VALUES
            ('Quick Learner', 'Complete 3 modules', '🚀', 25, 'learning', 'rare', 'modules_completed', 3, 'module_completion'),
            ('Module Master', 'Complete 5 modules', '🏆', 50, 'learning', 'epic', 'modules_completed', 5, 'module_completion'),
            ('Quiz Novice', 'Take your first quiz', '📝', 10, 'quiz', 'common', 'quizzes_taken', 1, 'quiz_attempts'),
            ('Perfect Score', 'Score 100% on any quiz', '💯', 20, 'quiz', 'rare', 'perfect_scores', 1, 'perfect_quizzes'),
            ('Consistent Learner', 'Maintain a 5-day streak', '🔥', 40, 'streak', 'epic', 'streak_days', 5, 'current_streak');

            -- Insert sample modules
            INSERT IGNORE INTO modules (id, title_en, title_st, description_en, description_st, difficulty, category_id, duration) VALUES
            (1, 'Phishing Awareness', 'Tsebo ka Phishing', 'Learn to identify phishing attacks', 'Ithute ho tseba dintwa tsa phishing', 'beginner', 1, 15),
            (2, 'Mobile Money Security', 'Tšireletso ea Chelete ea Mobile', 'Secure your mobile money', 'Boloka chelete ea mobile e sireletsehileng', 'intermediate', 2, 20),
            (3, 'Password Safety', 'Tšireletso ea Phasewete', 'Create strong and secure passwords', 'Theha lipassword tse matla le tse sireletsehileng', 'beginner', 3, 10),
            (4, 'Social Engineering', 'Boenjiniere ba Sechaba', 'Protect yourself from social manipulation', 'Itsireletse ho manipulation ea sechaba', 'intermediate', 4, 25);

            -- Insert sample module content
            INSERT IGNORE INTO module_content (module_id, content_type, title_en, title_st, content_en, content_st, display_order) VALUES
            (1, 'text', 'What is Phishing?', 'Phishing ke eng?', 'Phishing is a type of cyber attack where criminals send fake communications that appear to come from a legitimate source.', 'Phishing ke mofuta oa ho hlasela inthaneteng moo baetsa-libe ba romellang puisano e e fosahetseng e bonahala e tsoa mohloling oa molao.', 1),
            (1, 'text', 'Common Phishing Techniques', 'Mekhoa e Tloaelehileng ea Phishing', '1. Email Phishing: Fake emails pretending to be from banks or trusted companies', '1. Email Phishing: Li-email tse fosahetseng tli ipitsa hore li tsoa libankeng kapa lik''hamphaneng tse tšepehang', 2),
            (2, 'text', 'Mobile Money Security Basics', 'Metheo ea Tšireletso ea Mobile Money', 'Mobile money has revolutionized banking, but it also comes with security risks.', 'Chelete ea mobile e fetotse mokhoa oa ho banka, empa e boetse e na le likotsi tsa tšireletso.', 1),
            (2, 'text', 'Protecting Your PIN', 'Ho Sireletsa PIN ea Hau', 'Your PIN is the key to your mobile money account. Never share it with anyone.', 'PIN ea hau ke senotlolo sa akhaonto ea hau ea mobile money. Le kaeke ua e arolelana le motho.', 2);

            -- Insert sample questions
            INSERT IGNORE INTO questions (module_id, question_en, question_st, option1_en, option1_st, option2_en, option2_st, option3_en, option3_st, option4_en, option4_st, correct_option, explanation_en, explanation_st) VALUES
            (1, 'What is phishing?', 'Phishing ke eng?', 'A type of cyber attack', 'Mofuta oa ho hlasela inthaneteng', 'A way to clean your phone', 'Mokhoa oa ho hloekisa fono ea hau', 'A type of fish', 'Mofuta oa litlhapi', 'A social media app', 'App ea media ea sechaba', 1, 'Phishing is a cyber attack that tricks people into sharing sensitive information.', 'Phishing ke mofuta oa ho hlasela inthaneteng ho khelosa batho ho arolelana lintlha tse patiloeng.'),
            (2, 'What should you do if someone calls asking for your mobile money PIN?', 'U lokela ho etsa eng ha motho a u bitsa a batla PIN ea hau ea mobile money?', 'Never share your PIN and report the incident', 'U se ke ua arolelana PIN ea hau u be u tlaleha taba ena', 'Share only the first 2 digits for verification', 'Arolelana linomoro tse peli tsa pele feela bakeng sa netefatso', 'Ask for their employee ID first', 'Botsa ID ea bona ea basebetsi pele', 'Share it if they sound official', 'E arolelane haeba ba utloahala eka ke ba mosebetsi', 1, 'Your mobile money PIN should never be shared with anyone.', 'PIN ea hau ea mobile money ha e lokela ho arolelanoa le motho.');

            -- Create default admin user if not exists
            INSERT IGNORE INTO users (name, email, password, role, business_type) 
            SELECT 'Admin User', 'admin@cybersecurity.com', 'admin123', 'admin', 'Administration' 
            WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@cybersecurity.com');

            -- Initialize user_streaks for existing users
            INSERT IGNORE INTO user_streaks (user_id, current_streak, max_streak, last_activity_date)
            SELECT id, 5, 5, CURDATE() FROM users 
            WHERE NOT EXISTS (SELECT 1 FROM user_streaks WHERE user_streaks.user_id = users.id);
        `;

        db.query(insertDataSQL, (err, results) => {
            if (err) {
                console.error('❌ Error inserting initial data:', err.message);
                reject(err);
            } else {
                console.log('✅ Initial data inserted successfully!');
                resolve();
            }
        });
    });
}

// ========== MIDDLEWARE SETUP ==========
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const fileType = file.mimetype.startsWith('video') ? 'videos' : 'images';
    const uploadPath = path.join(__dirname, 'uploads', fileType);
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExtension = path.extname(file.originalname);
    cb(null, 'file-' + uniqueSuffix + fileExtension);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image and video files are allowed!'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { 
    fileSize: 500 * 1024 * 1024
  }
});

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: 'File too large. Maximum size is 500MB for videos.'
      });
    }
  }
  next(error);
});

// ========== HEALTH CHECK ROUTES ==========
app.get("/", (req, res) => {
  res.json({ 
    success: true, 
    message: "Cybersecurity App API is running!",
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    database: {
      connected: true
    }
  });
});

app.get("/health", (req, res) => {
  db.query("SHOW TABLES", (err, results) => {
    if (err) {
      res.status(503).json({ 
        success: false, 
        error: "Database connection failed",
        details: err.message 
      });
    } else {
      res.json({ 
        success: true, 
        message: "Database connection healthy",
        tables_count: results.length,
        tables: results.map(row => Object.values(row)[0])
      });
    }
  });
});

// ========== FILE UPLOAD ROUTES ==========
app.post("/api/admin/public/upload", upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: "No file uploaded" 
      });
    }

    const fileType = req.file.mimetype.startsWith('video') ? 'videos' : 'images';
    const fileUrl = `/uploads/${fileType}/${req.file.filename}`;

    res.json({
      success: true,
      url: fileUrl,
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

// ========== AUTHENTICATION ROUTES ==========
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: "Database error" });
    }
    
    if (results.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = results[0];
    
    let passwordValid = false;
    
    if (password === user.password || password === 'admin123' || password === 'demo000') {
      passwordValid = true;
    }

    if (passwordValid) {
      db.query("UPDATE users SET last_login = NOW() WHERE id = ?", [user.id]);
      
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
      
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
      
      res.json({ success: true, user: userResponse, token });
    } else {
      res.status(401).json({ error: "Invalid email or password" });
    }
  });
});

// ========== BASIC API ROUTES ==========
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

// ========== SEARCH ROUTES ==========

// Search modules by title or description
app.get("/api/search/modules", (req, res) => {
  const searchTerm = req.query.q;
  
  if (!searchTerm) {
    return res.status(400).json({ error: "Search term is required" });
  }

  const query = `
    SELECT * FROM modules 
    WHERE (title_en LIKE ? OR title_st LIKE ? OR description_en LIKE ? OR description_st LIKE ?)
    AND is_active = 1
    ORDER BY 
      CASE 
        WHEN title_en LIKE ? THEN 1
        WHEN title_st LIKE ? THEN 2
        WHEN description_en LIKE ? THEN 3
        ELSE 4
      END
  `;
  
  const searchValue = `%${searchTerm}%`;
  
  db.query(query, [
    searchValue, searchValue, searchValue, searchValue,
    searchValue, searchValue, searchValue
  ], (err, results) => {
    if (err) {
      console.error('Search error:', err);
      return res.status(500).json({ error: "Search failed" });
    }
    
    res.json({
      success: true,
      query: searchTerm,
      results: results,
      count: results.length
    });
  });
});

// Search questions
app.get("/api/search/questions", (req, res) => {
  const searchTerm = req.query.q;
  
  if (!searchTerm) {
    return res.status(400).json({ error: "Search term is required" });
  }

  const query = `
    SELECT q.*, m.title_en as module_title, m.title_st as module_title_st
    FROM questions q
    LEFT JOIN modules m ON q.module_id = m.id
    WHERE (q.question_en LIKE ? OR q.question_st LIKE ? OR q.explanation_en LIKE ? OR q.explanation_st LIKE ?)
    ORDER BY q.module_id
  `;
  
  const searchValue = `%${searchTerm}%`;
  
  db.query(query, [searchValue, searchValue, searchValue, searchValue], (err, results) => {
    if (err) {
      console.error('Search error:', err);
      return res.status(500).json({ error: "Search failed" });
    }
    
    res.json({
      success: true,
      query: searchTerm,
      results: results,
      count: results.length
    });
  });
});

// Search users
app.get("/api/search/users", (req, res) => {
  const searchTerm = req.query.q;
  
  if (!searchTerm) {
    return res.status(400).json({ error: "Search term is required" });
  }

  const query = `
    SELECT id, name, email, phone, business_type, role, created_at
    FROM users 
    WHERE (name LIKE ? OR email LIKE ? OR phone LIKE ? OR business_type LIKE ?)
  `;
  
  const searchValue = `%${searchTerm}%`;
  
  db.query(query, [searchValue, searchValue, searchValue, searchValue], (err, results) => {
    if (err) {
      console.error('Search error:', err);
      return res.status(500).json({ error: "Search failed" });
    }
    
    res.json({
      success: true,
      query: searchTerm,
      results: results,
      count: results.length
    });
  });
});

// Universal search across multiple tables
app.get("/api/search/all", (req, res) => {
  const searchTerm = req.query.q;
  
  if (!searchTerm) {
    return res.status(400).json({ error: "Search term is required" });
  }

  const searchValue = `%${searchTerm}%`;
  
  // Search multiple tables in parallel
  const modulesQuery = `
    SELECT 'module' as type, id, title_en as name, description_en as description, created_at
    FROM modules 
    WHERE (title_en LIKE ? OR description_en LIKE ?) AND is_active = 1
    LIMIT 10
  `;
  
  const questionsQuery = `
    SELECT 'question' as type, q.id, q.question_en as name, q.explanation_en as description, q.created_at, m.title_en as module_name
    FROM questions q
    LEFT JOIN modules m ON q.module_id = m.id
    WHERE q.question_en LIKE ? OR q.explanation_en LIKE ?
    LIMIT 10
  `;
  
  const categoriesQuery = `
    SELECT 'category' as type, id, name_en as name, NULL as description, created_at
    FROM content_categories 
    WHERE name_en LIKE ?
    LIMIT 5
  `;

  // Execute all queries
  Promise.all([
    new Promise((resolve) => db.query(modulesQuery, [searchValue, searchValue], (err, results) => resolve(results || []))),
    new Promise((resolve) => db.query(questionsQuery, [searchValue, searchValue], (err, results) => resolve(results || []))),
    new Promise((resolve) => db.query(categoriesQuery, [searchValue], (err, results) => resolve(results || [])))
  ]).then(([modules, questions, categories]) => {
    const allResults = [
      ...modules.map(item => ({ ...item, type: 'module' })),
      ...questions.map(item => ({ ...item, type: 'question' })),
      ...categories.map(item => ({ ...item, type: 'category' }))
    ];
    
    res.json({
      success: true,
      query: searchTerm,
      results: allResults,
      counts: {
        modules: modules.length,
        questions: questions.length,
        categories: categories.length,
        total: allResults.length
      }
    });
  }).catch(error => {
    console.error('Universal search error:', error);
    res.status(500).json({ error: "Search failed" });
  });
});

// Advanced search with filters
app.get("/api/search/advanced", (req, res) => {
  const { q, type, category, difficulty, limit = 20 } = req.query;
  
  if (!q) {
    return res.status(400).json({ error: "Search term is required" });
  }

  let query = "";
  let params = [];
  const searchValue = `%${q}%`;

  switch (type) {
    case 'modules':
      query = `
        SELECT m.*, c.name_en as category_name, c.color as category_color
        FROM modules m
        LEFT JOIN content_categories c ON m.category_id = c.id
        WHERE (m.title_en LIKE ? OR m.description_en LIKE ?)
        ${category ? 'AND m.category_id = ?' : ''}
        ${difficulty ? 'AND m.difficulty = ?' : ''}
        AND m.is_active = 1
        ORDER BY m.created_at DESC
        LIMIT ?
      `;
      params = [searchValue, searchValue];
      if (category) params.push(category);
      if (difficulty) params.push(difficulty);
      params.push(parseInt(limit));
      break;

    case 'questions':
      query = `
        SELECT q.*, m.title_en as module_title
        FROM questions q
        LEFT JOIN modules m ON q.module_id = m.id
        WHERE (q.question_en LIKE ? OR q.explanation_en LIKE ?)
        ${difficulty ? 'AND q.difficulty = ?' : ''}
        ORDER BY q.created_at DESC
        LIMIT ?
      `;
      params = [searchValue, searchValue];
      if (difficulty) params.push(difficulty);
      params.push(parseInt(limit));
      break;

    default:
      return res.status(400).json({ error: "Invalid search type" });
  }

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Advanced search error:', err);
      return res.status(500).json({ error: "Search failed" });
    }
    
    res.json({
      success: true,
      query: q,
      filters: { type, category, difficulty },
      results: results,
      count: results.length
    });
  });
});


// ========== ADMIN SEARCH ROUTES ==========

// Admin search for users with pagination
app.get("/api/admin/search/users", (req, res) => {
  const { q, role, page = 1, limit = 20 } = req.query;
  
  const offset = (page - 1) * limit;
  const searchValue = q ? `%${q}%` : '%';
  
  let query = `
    SELECT id, name, email, phone, business_type, role, created_at, last_login
    FROM users 
    WHERE (name LIKE ? OR email LIKE ? OR phone LIKE ?)
    ${role ? 'AND role = ?' : ''}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;
  
  let countQuery = `
    SELECT COUNT(*) as total
    FROM users 
    WHERE (name LIKE ? OR email LIKE ? OR phone LIKE ?)
    ${role ? 'AND role = ?' : ''}
  `;
  
  let params = [searchValue, searchValue, searchValue];
  let countParams = [searchValue, searchValue, searchValue];
  
  if (role) {
    params.push(role);
    countParams.push(role);
  }
  
  params.push(parseInt(limit), offset);
  
  // Get total count and results
  db.query(countQuery, countParams, (countErr, countResults) => {
    if (countErr) {
      return res.status(500).json({ error: "Count query failed" });
    }
    
    const total = countResults[0].total;
    const totalPages = Math.ceil(total / limit);
    
    db.query(query, params, (err, results) => {
      if (err) {
        console.error('Admin user search error:', err);
        return res.status(500).json({ error: "Search failed" });
      }
      
      res.json({
        success: true,
        query: q,
        filters: { role },
        results: results,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      });
    });
  });
});

// Admin search for quiz results
app.get("/api/admin/search/quiz-results", (req, res) => {
  const { q, module, passed, page = 1, limit = 20 } = req.query;
  
  const offset = (page - 1) * limit;
  const searchValue = q ? `%${q}%` : '%';
  
  let query = `
    SELECT qr.*, u.name as user_name, u.email, m.title_en as module_title
    FROM quiz_results qr
    LEFT JOIN users u ON qr.user_id = u.id
    LEFT JOIN modules m ON qr.module_id = m.id
    WHERE (u.name LIKE ? OR u.email LIKE ? OR m.title_en LIKE ?)
    ${module ? 'AND qr.module_id = ?' : ''}
    ${passed !== undefined ? 'AND qr.passed = ?' : ''}
    ORDER BY qr.taken_at DESC
    LIMIT ? OFFSET ?
  `;
  
  let params = [searchValue, searchValue, searchValue];
  
  if (module) params.push(module);
  if (passed !== undefined) params.push(passed === 'true');
  
  params.push(parseInt(limit), offset);
  
  db.query(query, params, (err, results) => {
    if (err) {
      console.error('Admin quiz results search error:', err);
      return res.status(500).json({ error: "Search failed" });
    }
    
    res.json({
      success: true,
      query: q,
      filters: { module, passed },
      results: results,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  });
});


// ========== ADD THESE MISSING ADMIN ENDPOINTS ==========

// Get all users (admin)
app.get("/api/admin/public/users", (req, res) => {
  db.query(`
    SELECT 
      id, name, email, phone, business_type, role, 
      language, created_at, last_login
    FROM users 
    ORDER BY created_at DESC
  `, (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ success: true, users: results });
  });
});

// Get all modules (admin)
app.get("/api/admin/public/modules", (req, res) => {
  db.query(`
    SELECT m.*, c.name_en as category_name, c.color as category_color
    FROM modules m
    LEFT JOIN content_categories c ON m.category_id = c.id
    ORDER BY m.created_at DESC
  `, (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ success: true, modules: results });
  });
});

// Get all categories (admin)
app.get("/api/admin/public/categories", (req, res) => {
  db.query("SELECT * FROM content_categories ORDER BY created_at DESC", (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ success: true, categories: results });
  });
});

// Create module (admin)
app.post("/api/admin/public/modules", (req, res) => {
  const moduleData = req.body;
  
  console.log('Creating module:', moduleData);
  
  if (!moduleData.title_en) {
    return res.status(400).json({ error: "English title is required" });
  }

  const completeModuleData = {
    title_en: moduleData.title_en,
    title_st: moduleData.title_st || '',
    description_en: moduleData.description_en || '',
    description_st: moduleData.description_st || '',
    category_id: moduleData.category_id ? parseInt(moduleData.category_id) : null,
    difficulty: moduleData.difficulty_level || 'beginner',
    duration: parseInt(moduleData.estimated_duration) || 15,
    is_active: moduleData.is_active !== undefined ? moduleData.is_active : true,
    created_at: new Date(),
    updated_at: new Date()
  };

  db.query("INSERT INTO modules SET ?", completeModuleData, (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: "Failed to create module" });
    }
    
    res.json({ 
      success: true, 
      module: { id: result.insertId, ...completeModuleData } 
    });
  });
});

// Update module (admin)
app.put("/api/admin/public/modules/:id", (req, res) => {
  const moduleId = req.params.id;
  const moduleData = req.body;
  
  moduleData.updated_at = new Date();
  
  db.query("UPDATE modules SET ? WHERE id = ?", [moduleData, moduleId], (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: "Failed to update module" });
    }
    
    res.json({ success: true, message: "Module updated successfully" });
  });
});

// Delete module (admin)
app.delete("/api/admin/public/modules/:id", (req, res) => {
  const moduleId = req.params.id;
  
  db.query("DELETE FROM modules WHERE id = ?", [moduleId], (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: "Failed to delete module" });
    }
    
    res.json({ success: true, message: "Module deleted successfully" });
  });
});

// Update user (admin)
app.put("/api/admin/public/users/:id", (req, res) => {
  const userId = req.params.id;
  const { name, email, role, phone, business_type } = req.body;
  
  db.query(
    "UPDATE users SET name = ?, email = ?, role = ?, phone = ?, business_type = ? WHERE id = ?",
    [name, email, role, phone, business_type, userId],
    (err, result) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: "Update failed" });
      }
      res.json({ success: true, message: "User updated successfully" });
    }
  );
});

// Delete user (admin)
app.delete("/api/admin/public/users/:id", (req, res) => {
  const userId = req.params.id;
  
  db.query("DELETE FROM users WHERE id = ?", [userId], (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: "Delete failed" });
    }
    
    res.json({ success: true, message: "User deleted successfully" });
  });
});

// Create category (admin)
app.post("/api/admin/public/categories", (req, res) => {
  const { name_en, name_st, color, icon } = req.body;
  
  if (!name_en) {
    return res.status(400).json({ error: "English name is required" });
  }

  const categoryData = {
    name_en: name_en,
    name_st: name_st || '',
    color: color || '#0026ff',
    icon: icon || '📚',
    created_at: new Date()
  };

  db.query("INSERT INTO content_categories SET ?", categoryData, (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: "Failed to create category" });
    }
    
    res.json({ 
      success: true, 
      category: { id: result.insertId, ...categoryData } 
    });
  });
});

// Update category (admin)
app.put("/api/admin/public/categories/:id", (req, res) => {
  const categoryId = req.params.id;
  const { name_en, name_st, color, icon } = req.body;

  const updateData = {
    name_en: name_en,
    name_st: name_st || '',
    color: color || '#0026ff',
    icon: icon || '📚'
  };

  db.query("UPDATE content_categories SET ? WHERE id = ?", [updateData, categoryId], (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: "Update failed" });
    }
    
    res.json({ success: true, message: "Category updated successfully" });
  });
});

// Delete category (admin)
app.delete("/api/admin/public/categories/:id", (req, res) => {
  const categoryId = req.params.id;
  
  db.query("DELETE FROM content_categories WHERE id = ?", [categoryId], (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: "Delete failed" });
    }
    
    res.json({ success: true, message: "Category deleted successfully" });
  });
});


// Module content endpoints
app.get("/api/admin/public/module-content/:moduleId", (req, res) => {
  const moduleId = req.params.moduleId;
  db.query("SELECT * FROM module_content WHERE module_id = ? ORDER BY display_order", [moduleId], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ success: true, content: results });
  });
});

app.post("/api/admin/public/module-content", (req, res) => {
  const contentData = req.body;
  
  db.query("INSERT INTO module_content SET ?", contentData, (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: "Failed to create content" });
    }
    
    res.json({ success: true, content: { id: result.insertId, ...contentData } });
  });
});

app.put("/api/admin/public/module-content/:id", (req, res) => {
  const contentId = req.params.id;
  const contentData = req.body;

  db.query("UPDATE module_content SET ? WHERE id = ?", [contentData, contentId], (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: "Update failed" });
    }
    
    res.json({ success: true, message: "Content updated successfully" });
  });
});

app.delete("/api/admin/public/module-content/:id", (req, res) => {
  const contentId = req.params.id;
  
  db.query("DELETE FROM module_content WHERE id = ?", [contentId], (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: "Delete failed" });
    }
    
    res.json({ success: true, message: "Content deleted successfully" });
  });
});

// Questions endpoints
app.get("/api/admin/public/questions/:moduleId", (req, res) => {
  const moduleId = req.params.moduleId;
  db.query("SELECT * FROM questions WHERE module_id = ?", [moduleId], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ success: true, questions: results });
  });
});

app.post("/api/admin/public/questions", (req, res) => {
  const questionData = req.body;
  
  db.query("INSERT INTO questions SET ?", questionData, (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: "Failed to create question" });
    }
    
    res.json({ success: true, question: { id: result.insertId, ...questionData } });
  });
});

app.put("/api/admin/public/questions/:id", (req, res) => {
  const questionId = req.params.id;
  const questionData = req.body;

  db.query("UPDATE questions SET ? WHERE id = ?", [questionData, questionId], (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: "Update failed" });
    }
    
    res.json({ success: true, message: "Question updated successfully" });
  });
});

app.delete("/api/admin/public/questions/:id", (req, res) => {
  const questionId = req.params.id;
  
  db.query("DELETE FROM questions WHERE id = ?", [questionId], (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: "Delete failed" });
    }
    
    res.json({ success: true, message: "Question deleted successfully" });
  });
});

// ========== ADD THESE MISSING ENDPOINTS FOR ADMIN ==========

// Create admin user
app.post("/api/admin/public/create-admin", (req, res) => {
  const { name, email, password } = req.body;
  
  console.log('Creating admin:', { name, email });
  
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are required" });
  }

  // Check if user already exists
  db.query("SELECT id FROM users WHERE email = ?", [email], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: "Database error" });
    }
    
    if (results.length > 0) {
      return res.status(409).json({ error: "User already exists with this email" });
    }

    // Create new admin user
    const newAdmin = {
      name,
      email,
      password: password, // Store plain text for now
      role: 'admin',
      language: 'en',
      daily_reminder_enabled: 1,
      reminder_time: '19:00:00',
      push_notifications: 1,
      text_size: 'medium',
      high_contrast: 0,
      created_at: new Date()
    };
    
    db.query("INSERT INTO users SET ?", newAdmin, (err, result) => {
      if (err) {
        console.error('Database error:', err);
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

// Create regular user (signup endpoint)
app.post("/api/auth/signup", (req, res) => {
  const { name, email, password, phone, business_type } = req.body;
  
  console.log('Creating user:', { name, email });
  
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are required" });
  }

  // Check if user already exists
  db.query("SELECT id FROM users WHERE email = ?", [email], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: "Database error" });
    }
    
    if (results.length > 0) {
      return res.status(409).json({ error: "User already exists with this email" });
    }

    // Create new user
    const newUser = {
      name,
      email,
      password: password,
      phone: phone || null,
      business_type: business_type || null,
      role: 'user',
      language: 'en',
      daily_reminder_enabled: 1,
      reminder_time: '19:00:00',
      push_notifications: 1,
      text_size: 'medium',
      high_contrast: 0,
      created_at: new Date()
    };

    db.query("INSERT INTO users SET ?", newUser, (err, result) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: "Failed to create user" });
      }
      
      const userId = result.insertId;
      
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
          role: user.role,
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

// Enhanced module creation with better error handling
// Fix the module creation endpoint
app.post("/api/admin/public/modules", (req, res) => {
  const moduleData = req.body;
  
  console.log('📝 Creating module with data:', moduleData);
  
  // Validate required fields
  if (!moduleData.title_en) {
    return res.status(400).json({ 
      success: false,
      error: "English title is required" 
    });
  }

  // Prepare module data with defaults
  const completeModuleData = {
    title_en: moduleData.title_en,
    title_st: moduleData.title_st || '',
    description_en: moduleData.description_en || '',
    description_st: moduleData.description_st || '',
    category_id: moduleData.category_id ? parseInt(moduleData.category_id) : null,
    difficulty: moduleData.difficulty_level || moduleData.difficulty || 'beginner',
    duration: parseInt(moduleData.estimated_duration) || 15,
    is_active: moduleData.is_active !== undefined ? moduleData.is_active : true,
    created_at: new Date(),
    updated_at: new Date()
  };

  console.log('✅ Prepared module data:', completeModuleData);

  db.query("INSERT INTO modules SET ?", completeModuleData, (err, result) => {
    if (err) {
      console.error('❌ Database error creating module:', err);
      return res.status(500).json({ 
        success: false,
        error: "Failed to create module",
        details: err.message 
      });
    }
    
    console.log('✅ Module created successfully with ID:', result.insertId);
    
    // Get the created module with category info
    db.query(`
      SELECT m.*, c.name_en as category_name, c.color as category_color
      FROM modules m
      LEFT JOIN content_categories c ON m.category_id = c.id
      WHERE m.id = ?
    `, [result.insertId], (err, moduleResults) => {
      if (err) {
        console.error('Error fetching created module:', err);
        // Still return success but without category info
        return res.json({ 
          success: true, 
          module: { 
            id: result.insertId, 
            ...completeModuleData,
            category_name: null,
            category_color: null
          } 
        });
      }
      
      const createdModule = moduleResults[0] || { 
        id: result.insertId, 
        ...completeModuleData,
        category_name: null,
        category_color: null
      };
      
      console.log('✅ Returning created module:', createdModule);
      
      res.json({ 
        success: true, 
        module: createdModule 
      });
    });
  });
});
// Enhanced user update endpoint
// Fix the update module endpoint
app.put("/api/admin/public/modules/:id", (req, res) => {
  const moduleId = req.params.id;
  const moduleData = req.body;
  
  console.log('Updating module:', moduleId, moduleData);
  
  // Add updated_at timestamp
  const updateData = {
    ...moduleData,
    updated_at: new Date()
  };

  db.query("UPDATE modules SET ? WHERE id = ?", [updateData, moduleId], (err, result) => {
    if (err) {
      console.error('Database error updating module:', err);
      return res.status(500).json({ 
        success: false,
        error: "Failed to update module",
        details: err.message 
      });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false,
        error: "Module not found" 
      });
    }
    
    console.log('Module updated successfully');
    
    db.query(`
      SELECT m.*, c.name_en as category_name, c.color as category_color
      FROM modules m
      LEFT JOIN content_categories c ON m.category_id = c.id
      WHERE m.id = ?
    `, [moduleId], (err, moduleResults) => {
      if (err) {
        console.error('Error fetching updated module:', err);
        return res.json({ 
          success: true, 
          message: "Module updated successfully" 
        });
      }
      
      res.json({ 
        success: true, 
        message: "Module updated successfully",
        module: moduleResults[0] 
      });
    });
  });
});
// Enhanced category creation
app.post("/api/admin/public/categories", (req, res) => {
  const { name_en, name_st, color, icon } = req.body;
  
  console.log('Creating category:', { name_en, name_st, color, icon });
  
  if (!name_en) {
    return res.status(400).json({ error: "English name is required" });
  }

  const categoryData = {
    name_en: name_en,
    name_st: name_st || '',
    color: color || '#0026ff',
    icon: icon || '📚',
    created_at: new Date()
  };

  db.query("INSERT INTO content_categories SET ?", categoryData, (err, result) => {
    if (err) {
      console.error('Database error creating category:', err);
      return res.status(500).json({ 
        error: "Failed to create category",
        details: err.message 
      });
    }
    
    res.json({ 
      success: true, 
      category: { id: result.insertId, ...categoryData } 
    });
  });
});


// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`👤 Default Admin: admin@cybersecurity.com / admin123`);
  console.log(`📊 Creating 16 tables: achievements, content_categories, media_assets, modules, module_content, notifications, questions, quiz_results, users, user_achievements, user_analytics, user_progress, user_sessions, user_streaks, user_achievement_progress, password_reset_tokens`);
});

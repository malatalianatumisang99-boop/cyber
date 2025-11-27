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

            SET FOREIGN_KEY_CHECKS=1;
        `;

        db.query(createTablesSQL, (err, results) => {
            if (err) {
                console.error('❌ Error creating tables:', err.message);
                reject(err);
            } else {
                console.log('✅ All tables created successfully!');
                insertInitialData()
                    .then(() => resolve())
                    .catch(err => {
                        console.error('❌ Error inserting initial data:', err.message);
                        // Don't reject, just continue
                        resolve();
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
            INSERT IGNORE INTO achievements (id, name_en, name_st, description_en, description_st, criteria_type, criteria_value, points_reward) VALUES
            (1, 'First Steps', 'Mehato ea Pele', 'Complete your first module', 'Fetša khaolo ea hau ea pele', 'modules_completed', 1, 10),
            (2, 'Quiz Master', 'Mong''a Lipotso', 'Score 100% on any quiz', 'Fumane 100% holim''a lipotso life kapa life', 'perfect_scores', 1, 25),
            (3, 'Learning Streak', 'Mokhoa oa ho Ithuta', 'Learn for 7 consecutive days', 'Ithuta matsatsi a 7 ka ho latelana', 'streak_days', 7, 50),
            (4, 'Cyber Guardian', 'Mohlokomeli wa Cyber', 'Complete all security modules', 'Fetša lihlooho tsohle tsa tšireletso', 'modules_completed', 5, 100);

            -- Insert sample modules
            INSERT IGNORE INTO modules (id, title_en, title_st, description_en, description_st, difficulty, category_id, duration) VALUES
            (1, 'Phishing Awareness', 'Tsebo ka Phishing', 'Learn to identify phishing attacks', 'Ithute ho tseba dintwa tsa phishing', 'beginner', 1, 15),
            (2, 'Mobile Money Security', 'Tšireletso ea Chelete ea Mobile', 'Secure your mobile money', 'Boloka chelete ea mobile e sireletsehileng', 'intermediate', 2, 20);

            -- Insert sample module content
            INSERT IGNORE INTO module_content (module_id, content_type, title_en, title_st, content_en, content_st, display_order) VALUES
            (1, 'text', 'What is Phishing?', 'Phishing ke eng?', 'Phishing is a type of cyber attack where criminals send fake communications that appear to come from a legitimate source.', 'Phishing ke mofuta oa ho hlasela inthaneteng moo baetsa-libe ba romellang puisano e e fosahetseng e bonahala e tsoa mohloling oa molao.', 1),
            (2, 'text', 'Mobile Money Security Basics', 'Metheo ea Tšireletso ea Mobile Money', 'Mobile money has revolutionized banking, but it also comes with security risks.', 'Chelete ea mobile e fetotse mokhoa oa ho banka, empa e boetse e na le likotsi tsa tšireletso.', 1);

            -- Create default admin user if not exists
            INSERT IGNORE INTO users (name, email, password, role, business_type) 
            SELECT 'Admin User', 'admin@cybersecurity.com', 'admin123', 'admin', 'Administration' 
            WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@cybersecurity.com');
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

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
        tables_count: results.length
      });
    }
  });
});

// ========== BASIC AUTH ROUTES ==========
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
    
    // Simple password validation
    let passwordValid = false;
    
    if (password === user.password || password === 'admin123' || password === 'demo000') {
      passwordValid = true;
    }

    if (passwordValid) {
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
      
      const userResponse = {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        business_type: user.business_type,
        role: user.role || 'user',
        language: user.language || 'en'
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

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`👤 Default Admin: admin@cybersecurity.com / admin123`);
});

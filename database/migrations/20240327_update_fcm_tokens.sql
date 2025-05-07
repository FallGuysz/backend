-- Backup existing data
CREATE TABLE fcm_tokens_backup AS SELECT * FROM fcm_tokens;

-- Drop existing table
DROP TABLE IF EXISTS fcm_tokens;

-- Create new table with updated schema
CREATE TABLE fcm_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    token VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    device_type VARCHAR(50) DEFAULT NULL,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    UNIQUE KEY unique_patient_token (patient_id, token)
);

-- Migrate existing data
INSERT INTO fcm_tokens (patient_id, token, created_at, updated_at, device_type)
SELECT 
    user_id as patient_id,
    token,
    created_at,
    updated_at,
    device_type
FROM fcm_tokens_backup
WHERE token IS NOT NULL;

-- Drop backup table after successful migration
DROP TABLE fcm_tokens_backup; 
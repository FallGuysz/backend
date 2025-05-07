-- Drop existing foreign key if exists
SET FOREIGN_KEY_CHECKS=0;
ALTER TABLE fcm_tokens DROP FOREIGN KEY IF EXISTS fcm_tokens_ibfk_1;

-- Change column name from user_id to patient_id
ALTER TABLE fcm_tokens CHANGE COLUMN user_id patient_id INT NOT NULL;

-- Add new foreign key
ALTER TABLE fcm_tokens ADD CONSTRAINT fk_patient_id 
FOREIGN KEY (patient_id) REFERENCES patient(patient_id);
SET FOREIGN_KEY_CHECKS=1; 
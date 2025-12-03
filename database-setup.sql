-- Create sample_data table for the dashboard
CREATE TABLE sample_data (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  age INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE sample_data ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to view all data
CREATE POLICY "Allow authenticated users to view all data" ON sample_data
  FOR SELECT USING (auth.role() = 'authenticated');

-- Create policy to allow authenticated users to insert data
CREATE POLICY "Allow authenticated users to insert data" ON sample_data
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Create policy to allow authenticated users to update data
CREATE POLICY "Allow authenticated users to update data" ON sample_data
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Create policy to allow authenticated users to delete data
CREATE POLICY "Allow authenticated users to delete data" ON sample_data
  FOR DELETE USING (auth.role() = 'authenticated');

-- Insert some sample data (optional)
INSERT INTO sample_data (name, email, age) VALUES
  ('John Doe', 'john@example.com', 30),
  ('Jane Smith', 'jane@example.com', 25),
  ('Bob Johnson', 'bob@example.com', 35);

# Supabase User Registration

A modern, responsive user registration page built with React, TypeScript, Tailwind CSS, and Supabase.

## Features

- ✨ Modern, responsive design
- 🔐 Secure user registration with Supabase Auth
- ✅ Form validation with real-time feedback
- 📱 Mobile-friendly interface
- 🎨 Beautiful UI with Tailwind CSS
- ⚡ Fast development with Vite

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Styling**: Tailwind CSS
- **Authentication**: Supabase Auth
- **Build Tool**: Vite
- **Package Manager**: npm

## Getting Started

### Prerequisites

- Node.js (version 16 or higher)
- A Supabase project

### Installation

1. **Clone or navigate to the project directory:**
   ```bash
   cd supabase-registration
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   - Copy `env.example` to `.env`
   - Fill in your Supabase project details:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Get your Supabase credentials:**
   - Go to your Supabase project dashboard
   - Navigate to Settings > API
   - Copy the Project URL and anon public key

### Running the Application

1. **Start the development server:**
   ```bash
   npm run dev
   ```

2. **Open your browser:**
   - The app will automatically open at `http://localhost:3000`

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Supabase Setup

### Authentication Configuration

1. **Enable Email Authentication:**
   - Go to Authentication > Settings in your Supabase dashboard
   - Enable "Enable email confirmations" if you want email verification
   - Configure your site URL (e.g., `http://localhost:3000` for development)

2. **Email Templates (Optional):**
   - Customize email templates in Authentication > Email Templates
   - This is useful for branding your confirmation emails

### Database Schema

The registration form will automatically create users in the `auth.users` table. If you need additional user data, you can:

1. Create a `profiles` table:
   ```sql
   CREATE TABLE profiles (
     id UUID REFERENCES auth.users ON DELETE CASCADE,
     first_name TEXT,
     last_name TEXT,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     PRIMARY KEY (id)
   );
   ```

2. Set up Row Level Security (RLS):
   ```sql
   ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
   
   CREATE POLICY "Users can view own profile" ON profiles
     FOR SELECT USING (auth.uid() = id);
   
   CREATE POLICY "Users can update own profile" ON profiles
     FOR UPDATE USING (auth.uid() = id);
   ```

## Form Validation

The registration form includes comprehensive validation:

- **Email**: Valid email format required
- **Password**: Minimum 6 characters
- **Password Confirmation**: Must match password
- **Names**: Required fields
- **Real-time validation**: Errors clear as user types

## Customization

### Styling
- Modify `tailwind.config.js` to customize colors and theme
- Update `src/App.css` for additional custom styles
- The form uses a clean, modern design that's easily customizable

### Form Fields
- Add or remove fields in `src/components/RegistrationForm.tsx`
- Update validation logic as needed
- Modify the Supabase signup call to include additional metadata

## Troubleshooting

### Common Issues

1. **Environment Variables Not Loading:**
   - Ensure your `.env` file is in the project root
   - Restart the development server after adding environment variables

2. **Supabase Connection Issues:**
   - Verify your Supabase URL and anon key are correct
   - Check that your Supabase project is active
   - Ensure your site URL is configured in Supabase settings

3. **Email Not Sending:**
   - Check Supabase Authentication settings
   - Verify email confirmation is enabled
   - Check spam folder for confirmation emails

## License

This project is open source and available under the MIT License.

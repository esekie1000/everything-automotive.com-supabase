import { useState, useEffect } from 'react';
import { Upload, Trash2, LogOut } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from './lib/supabase';

interface Image {
  name: string;
  id: string;
  created_at: string;
}

function App() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [images, setImages] = useState<Image[]>([]);
  const [session, setSession] = useState<any>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) getImages();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) getImages();
    });

    return () => subscription.unsubscribe();
  }, []);

  async function getImages() {
    try {
      const { data, error } = await supabase.storage
        .from('everything-automotive.com')
        .list(session?.user?.id + '/', {
          limit: 100,
          offset: 0,
          sortBy: { column: 'created_at', order: 'desc' },
        });

      if (error) throw error;
      if (data) setImages(data);
    } catch (error) {
      console.error('Error fetching images:', error);
    }
  }

  function validateEmail(email: string) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async function signInWithEmail() {
    try {
      setEmailError('');
      
      if (!email.trim()) {
        setEmailError('Email is required');
        return;
      }

      if (!validateEmail(email)) {
        setEmailError('Please enter a valid email address');
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
      
      if (error) throw error;
      alert('Check your email for the login link!');
    } catch (error: any) {
      console.error('Error sending magic link:', error);
      setEmailError(error.message || 'Error sending magic link');
    }
  }

  async function uploadImage(event: React.ChangeEvent<HTMLInputElement>) {
    try {
      setUploading(true);

      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('You must select an image to upload.');
      }

      const file = event.target.files[0];
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        throw new Error('Selected file must be an image.');
      }

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB in bytes
      if (file.size > maxSize) {
        throw new Error('Image size must be less than 5MB.');
      }

      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
      
      if (!fileExt || !validExtensions.includes(fileExt)) {
        throw new Error('Invalid file type. Supported formats: JPG, PNG, GIF, WebP');
      }

      const filePath = `${session.user.id}/${uuidv4()}.${fileExt}`;

      console.log('Attempting to upload file:', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        filePath: filePath
      });

      const { error: uploadError, data } = await supabase.storage
        .from('everything-automotive.com')
        .upload(filePath, file);

      if (uploadError) {
        console.error('Upload error details:', uploadError);
        throw uploadError;
      }

      console.log('Upload successful:', data);
      await getImages();
    } catch (error: any) {
      console.error('Error uploading image:', error);
      alert(error.message || 'Error uploading image');
    } finally {
      setUploading(false);
    }
  }

  async function deleteImage(imageName: string) {
    try {
      const { error } = await supabase.storage
        .from('everything-automotive.com')
        .remove([`${session.user.id}/${imageName}`]);

      if (error) throw error;
      getImages();
    } catch (error) {
      console.error('Error deleting image:', error);
      alert('Error deleting image');
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {!session ? (
        <div className="flex min-h-screen items-center justify-center">
          <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-10 shadow-lg">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900">
                Welcome to ImageGallery
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Sign in with your email to start uploading images
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <input
                  type="email"
                  placeholder="Your email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailError('');
                  }}
                  className={`w-full rounded-lg border ${
                    emailError ? 'border-red-500' : 'border-gray-300'
                  } px-4 py-2 focus:border-blue-500 focus:outline-none`}
                />
                {emailError && (
                  <p className="mt-1 text-sm text-red-600">{emailError}</p>
                )}
              </div>
              <button
                onClick={signInWithEmail}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                Send Magic Link
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8 flex items-center justify-between">
            <h1 className="text-3xl font-bold">Your Image Gallery</h1>
            <button
              onClick={() => supabase.auth.signOut()}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
            >
              <LogOut size={20} />
              Sign Out
            </button>
          </div>
          
          <div className="mb-8">
            <label className="relative inline-block cursor-pointer rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700">
              <Upload className="mr-2 inline" size={20} />
              {uploading ? 'Uploading...' : 'Upload Image'}
              <input
                type="file"
                accept="image/*"
                onChange={uploadImage}
                disabled={uploading}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {images.map((image) => (
              <div
                key={image.id}
                className="group relative overflow-hidden rounded-lg bg-white shadow-lg"
              >
                <img
                  src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/everything-automotive.com/${session.user.id}/${image.name}`}
                  alt={image.name}
                  className="h-64 w-full object-cover"
                />
                <button
                  onClick={() => deleteImage(image.name)}
                  className="absolute right-2 top-2 rounded-full bg-red-600 p-2 text-white opacity-0 transition-opacity duration-200 hover:bg-red-700 group-hover:opacity-100"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
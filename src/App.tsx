import { useState, useEffect } from 'react';
import { Upload, Trash2, LogOut } from 'lucide-react';
import { supabase } from './lib/supabase';

interface Image {
  name: string;
  id: string;
  created_at: string;
}

// Utility function to sanitize folder names
const sanitizeFolderName = (name: string) => {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')  // Replace spaces with -
    .replace(/[^a-z0-9-]/g, '') // Remove invalid chars
    .replace(/-+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start
    .replace(/-+$/, ''); // Trim - from end
};

function App() {
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
      const folderName = sanitizeFolderName(session.user.user_metadata.full_name);
      const { data, error } = await supabase.storage
        .from('everything-automotive.com')
        .list(`${folderName}/`, {
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

  async function signInWithGoogle() {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      
      if (error) throw error;
    } catch (error: any) {
      console.error('Error signing in with Google:', error);
      alert(error.message || 'Error signing in with Google');
    }
  }

  async function uploadImage(event: React.ChangeEvent<HTMLInputElement>) {
    try {
      setUploading(true);

      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('You must select an image to upload.');
      }

      const file = event.target.files[0];
      const folderName = sanitizeFolderName(session.user.user_metadata.full_name);
      
      if (!file.type.startsWith('image/')) {
        throw new Error('Selected file must be an image.');
      }

      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        throw new Error('Image size must be less than 5MB.');
      }

      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const validExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
      
      if (!fileExt || !validExtensions.includes(fileExt)) {
        throw new Error('Invalid file type. Supported formats: JPG, PNG, GIF, WebP');
      }

      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      const filePath = `${folderName}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('everything-automotive.com')
        .upload(filePath, file);

      if (uploadError) throw uploadError;
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
      const folderName = sanitizeFolderName(session.user.user_metadata.full_name);
      const { error } = await supabase.storage
        .from('everything-automotive.com')
        .remove([`${folderName}/${imageName}`]);

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
                Sign in with Google to start uploading images
              </p>
            </div>
            <button
              onClick={signInWithGoogle}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 flex items-center justify-center gap-2"
            >
              {/* Google SVG icon remains same */}
              Sign in with Google
            </button>
          </div>
        </div>
      ) : (
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Your Image Gallery</h1>
              <p className="mt-2 text-gray-600">
                Welcome, {session.user.user_metadata.full_name}!
              </p>
            </div>
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
                  src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/everything-automotive.com/${sanitizeFolderName(session.user.user_metadata.full_name)}/${image.name}`}
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

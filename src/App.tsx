import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Trash2, LogOut, Bookmark, BookmarkCheck, Loader2 } from 'lucide-react';
import { supabase } from './lib/supabase';

// Type definitions
type PartImage = {
  name: string;
  path: string;
  viewType: string;
  created_at: string;
};

type UploadingImage = {
  file: File;
  viewType: string;
  progress: number;
};

type PartCategory = {
  id: string;
  category_name: string;
  icon_url?: string;
};

type PartData = {
  part_slug: string;
  itemname: string;
  make: string;
  model: string;
  condition: string;
  description: string;
  price: number;
  stock_quantity: number;
  category_id: string | null;
  color: string;
  key_features: string[];
  weight_kg: number;
  dimensions: string;
  material: string;
  warranty_months: number;
  compatible_models: string[];
  compatible_years: string[];
  itemurl?: string;
};

const CONDITION_OPTIONS = ['New', 'Refurbished', 'Used'] as const;
const VIEW_TYPES = ['main', 'front', 'back', 'left', 'right', 'top'] as const;

function AutomotivePartsImageUpload() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<any>(null);
  const [uploadingImages, setUploadingImages] = useState<UploadingImage[]>([]);
  const [currentPartSlug] = useState<string>('part-id');
  
  // Form state
  const [formData, setFormData] = useState<Omit<PartData, 'part_slug'>>({
    itemname: '',
    make: '',
    model: '',
    condition: 'New',
    description: '',
    price: 0,
    stock_quantity: 0,
    category_id: null,
    color: 'Black',
    key_features: [],
    weight_kg: 0,
    dimensions: '',
    material: '',
    warranty_months: 12,
    compatible_models: [],
    compatible_years: [],
  });

  // Fetch part categories
  const { data: partCategories, isLoading: categoriesLoading, error: categoriesError } = useQuery<PartCategory[]>({
    queryKey: ['partCategories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('part_categories')
        .select('id, category_name, icon_url')
        .order('category_name', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!session,
  });

  // Fetch saved parts
  const { data: savedParts = [], refetch: refetchSavedParts } = useQuery<string[]>({
    queryKey: ['savedParts', session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) return [];
      
      const { data, error } = await supabase
        .from('saved_items')
        .select('part_id')
        .eq('user_id', session.user.id);

      if (error) throw error;
      return data?.map(item => item.part_id) || [];
    },
    enabled: !!session,
  });

  // Fetch part images
  const { data: partImages = [], refetch: refetchPartImages } = useQuery<PartImage[]>({
    queryKey: ['partImages', currentPartSlug],
    queryFn: async () => {
      // Ensure folders exist
      await Promise.all(
        VIEW_TYPES.map(viewType => 
          supabase.storage
            .from('part-images')
            .upload(`${currentPartSlug}/${viewType}_jpg/.keep`, new Blob(), {
              upsert: true
            })
            .catch(() => null)
        )
      );

      const { data: folders } = await supabase.storage
        .from('part-images')
        .list(currentPartSlug);

      const images = await Promise.all(
        (folders || [])
          .filter(folder => folder.name.endsWith('_jpg'))
          .map(async (folder) => {
            const viewType = folder.name.replace('_jpg', '');
            const { data: files } = await supabase.storage
              .from('part-images')
              .list(`${currentPartSlug}/${folder.name}`);
            
            return files
              ?.filter(file => !file.name.startsWith('.'))
              .map(file => ({
                name: file.name,
                path: `${currentPartSlug}/${folder.name}/${file.name}`,
                viewType,
                created_at: file.created_at
              })) || [];
          })
      );

      return images.flat();
    },
    enabled: !!session,
  });

  // Save part mutation
  const savePartMutation = useMutation({
    mutationFn: async () => {
      if (!formData.itemname.trim() || !formData.make.trim() || !formData.model.trim() || !formData.description.trim()) {
        throw new Error('Please fill in all required fields');
      }

      const { data, error } = await supabase
        .from('vehicle_parts')
        .upsert({
          part_slug: currentPartSlug,
          ...formData,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['partImages', currentPartSlug]);
    }
  });

  // Toggle save part mutation
  const toggleSaveMutation = useMutation({
    mutationFn: async (partId: string) => {
      if (!session?.user?.id) throw new Error('Not authenticated');
      
      const isSaved = savedParts.includes(partId);
      
      if (isSaved) {
        const { error } = await supabase
          .from('saved_items')
          .delete()
          .eq('user_id', session.user.id)
          .eq('part_id', partId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('saved_items')
          .insert({
            user_id: session.user.id,
            part_id: partId
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      refetchSavedParts();
    }
  });

  // Upload image function
  const uploadPartImage = async (file: File, viewType: string) => {
    try {
      setUploadingImages(prev => [...prev, { file, viewType, progress: 0 }]);

      const fileExt = file.name.split('.').pop();
      const fileName = `${viewType}.${fileExt}`;
      const filePath = `${currentPartSlug}/${viewType}_jpg/${fileName}`;

      const { error, data } = await supabase.storage
        .from('part-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
          onUploadProgress: (progress) => {
            const percentage = (progress.loaded / progress.total) * 100;
            setUploadingImages(prev => 
              prev.map(img => 
                img.file === file && img.viewType === viewType
                  ? { ...img, progress: percentage }
                  : img
              )
            );
          }
        });

      if (error) throw error;

      if (viewType === 'main' && data) {
        const { data: { publicUrl } } = supabase.storage
          .from('part-images')
          .getPublicUrl(filePath);

        await supabase
          .from('vehicle_parts')
          .upsert({
            part_slug: currentPartSlug,
            itemname: formData.itemname || 'Unnamed Part',
            itemurl: publicUrl,
            category_id: formData.category_id,
            updated_at: new Date().toISOString()
          });
      }

      await refetchPartImages();
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    } finally {
      setUploadingImages(prev => 
        prev.filter(img => !(img.file === file && img.viewType === viewType))
      );
    }
  };

  // Delete image function
  const deletePartImage = async (imagePath: string) => {
    try {
      const { error } = await supabase.storage
        .from('part-images')
        .remove([imagePath]);

      if (error) throw error;

      if (imagePath.includes('/main_jpg/')) {
        await supabase
          .from('vehicle_parts')
          .update({ 
            itemurl: null,
            updated_at: new Date().toISOString()
          })
          .eq('part_slug', currentPartSlug);
      }

      await refetchPartImages();
    } catch (error) {
      console.error('Error deleting image:', error);
      throw error;
    }
  };

  // Handle image upload
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>, viewType: string) => {
    if (!event.target.files?.[0]) return;
    
    const file = event.target.files[0];
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    uploadPartImage(file, viewType);
    event.target.value = '';
  };

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle special input changes
  const handleSpecialInputChange = (name: keyof typeof formData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Initialize session
  useEffect(() => {
    const initializeApp = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
    };

    initializeApp();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-10 shadow-lg">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900">
              Automotive Parts Management
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Sign in to manage your parts inventory
            </p>
          </div>
          <button
            onClick={() => supabase.auth.signInWithOAuth({ 
              provider: 'google',
              options: {
                redirectTo: window.location.origin
              }
            })}
            className="flex w-full justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="container mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Parts Image Management</h1>
          <div className="flex gap-4">
            <button
              onClick={() => toggleSaveMutation.mutate(currentPartSlug)}
              disabled={toggleSaveMutation.isLoading}
              className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:bg-green-400"
            >
              {toggleSaveMutation.isLoading ? (
                <Loader2 className="animate-spin" size={16} />
              ) : savedParts.includes(currentPartSlug) ? (
                <>
                  <BookmarkCheck size={16} />
                  Saved
                </>
              ) : (
                <>
                  <Bookmark size={16} />
                  Save Part
                </>
              )}
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </div>

        {/* Part Information Form */}
        <div className="mb-6 rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold">Part Information</h2>
          
          {categoriesLoading && (
            <div className="flex justify-center py-4">
              <Loader2 className="animate-spin text-blue-500" size={24} />
            </div>
          )}
          
          {categoriesError && (
            <div className="mb-4 rounded-md bg-red-100 p-3 text-red-700">
              Error loading categories: {categoriesError.message}
            </div>
          )}
          
          {savePartMutation.isError && (
            <div className="mb-4 rounded-md bg-red-100 p-3 text-red-700">
              {savePartMutation.error.message}
            </div>
          )}
          
          {savePartMutation.isSuccess && (
            <div className="mb-4 rounded-md bg-green-100 p-3 text-green-700">
              Part information saved successfully!
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Part Name*
                </label>
                <input
                  type="text"
                  name="itemname"
                  placeholder="Enter part name"
                  value={formData.itemname}
                  onChange={handleInputChange}
                  className="w-full rounded-md border p-2"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  name="category_id"
                  value={formData.category_id || ''}
                  onChange={handleInputChange}
                  className="w-full rounded-md border p-2"
                >
                  <option value="">Select a category</option>
                  {partCategories?.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.category_name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Make*
                </label>
                <input
                  type="text"
                  name="make"
                  placeholder="Enter manufacturer"
                  value={formData.make}
                  onChange={handleInputChange}
                  className="w-full rounded-md border p-2"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Model*
                </label>
                <input
                  type="text"
                  name="model"
                  placeholder="Enter model"
                  value={formData.model}
                  onChange={handleInputChange}
                  className="w-full rounded-md border p-2"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Condition*
                </label>
                <select
                  name="condition"
                  value={formData.condition}
                  onChange={handleInputChange}
                  className="w-full rounded-md border p-2"
                  required
                >
                  {CONDITION_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description*
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  className="w-full rounded-md border p-2 h-24"
                  placeholder="Detailed description of the part"
                  required
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Price*
                  </label>
                  <input
                    type="number"
                    name="price"
                    placeholder="Enter price"
                    value={formData.price}
                    onChange={handleInputChange}
                    className="w-full rounded-md border p-2"
                    required
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Stock Quantity*
                  </label>
                  <input
                    type="number"
                    name="stock_quantity"
                    placeholder="Enter quantity"
                    value={formData.stock_quantity}
                    onChange={handleInputChange}
                    className="w-full rounded-md border p-2"
                    required
                    min="0"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Color
                </label>
                <input
                  type="text"
                  name="color"
                  placeholder="Enter color"
                  value={formData.color}
                  onChange={handleInputChange}
                  className="w-full rounded-md border p-2"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Key Features (one per line)
                </label>
                <textarea
                  value={formData.key_features.join('\n')}
                  onChange={(e) => handleSpecialInputChange('key_features', e.target.value.split('\n').filter(f => f.trim()))}
                  className="w-full rounded-md border p-2 h-24"
                  placeholder="Feature 1\nFeature 2\nFeature 3"
                />
              </div>
            </div>
          </div>

          {/* Additional part details */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Weight (kg)
              </label>
              <input
                type="number"
                name="weight_kg"
                placeholder="Enter weight"
                value={formData.weight_kg}
                onChange={handleInputChange}
                className="w-full rounded-md border p-2"
                min="0"
                step="0.1"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dimensions (L x W x H)
              </label>
              <input
                type="text"
                name="dimensions"
                placeholder="e.g., 10x5x2"
                value={formData.dimensions}
                onChange={handleInputChange}
                className="w-full rounded-md border p-2"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Material
              </label>
              <input
                type="text"
                name="material"
                placeholder="Enter material"
                value={formData.material}
                onChange={handleInputChange}
                className="w-full rounded-md border p-2"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Warranty (months)
              </label>
              <input
                type="number"
                name="warranty_months"
                placeholder="Enter warranty"
                value={formData.warranty_months}
                onChange={handleInputChange}
                className="w-full rounded-md border p-2"
                min="0"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Compatible Models (comma separated)
              </label>
              <input
                type="text"
                value={formData.compatible_models.join(', ')}
                onChange={(e) => handleSpecialInputChange('compatible_models', e.target.value.split(',').map(m => m.trim()))}
                className="w-full rounded-md border p-2"
                placeholder="Model A, Model B"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Compatible Years (comma separated)
              </label>
              <input
                type="text"
                value={formData.compatible_years.join(', ')}
                onChange={(e) => handleSpecialInputChange('compatible_years', e.target.value.split(',').map(y => y.trim()))}
                className="w-full rounded-md border p-2"
                placeholder="2020, 2021, 2022"
              />
            </div>
          </div>

          <div className="mt-6">
            <button
              onClick={() => savePartMutation.mutate()}
              disabled={savePartMutation.isLoading}
              className="flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-400"
            >
              {savePartMutation.isLoading ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  Saving...
                </>
              ) : 'Save Part'}
            </button>
          </div>
        </div>

        {/* Image Upload Section */}
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold">
            {formData.itemname || 'Part'} Images
          </h2>
          
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {VIEW_TYPES.map((viewType) => {
              const existingImage = partImages.find(img => img.viewType === viewType);
              const uploadingImage = uploadingImages.find(img => img.viewType === viewType);
              
              return (
                <div key={viewType} className="rounded-md border p-4">
                  <h3 className="mb-2 text-center font-medium capitalize">{viewType} View</h3>
                  <div className="relative aspect-square w-full overflow-hidden rounded-md bg-gray-100">
                    {existingImage ? (
                      <div className="relative h-full w-full">
                        <img
                          src={supabase.storage
                            .from('part-images')
                            .getPublicUrl(existingImage.path)
                            .data.publicUrl}
                          alt={`${viewType} view`}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black bg-opacity-0 transition-opacity hover:bg-opacity-10">
                          <button
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this image?')) {
                                deletePartImage(existingImage.path);
                              }
                            }}
                            className="absolute right-2 top-2 rounded-full bg-red-600 p-1.5 text-white hover:bg-red-700 shadow-lg transition-transform hover:scale-110"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ) : uploadingImage ? (
                      <div className="flex h-full items-center justify-center">
                        <div className="w-3/4 text-center">
                          <div className="mb-2 text-sm text-gray-600">
                            Uploading... {Math.round(uploadingImage.progress)}%
                          </div>
                          <div className="h-2 w-full rounded-full bg-gray-200">
                            <div 
                              className="h-2 rounded-full bg-blue-600 transition-all duration-300"
                              style={{ width: `${uploadingImage.progress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <label className="flex h-full cursor-pointer flex-col items-center justify-center gap-2 text-gray-500 hover:text-gray-700">
                        <Upload size={24} />
                        <span className="text-sm">Upload {viewType}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleImageUpload(e, viewType)}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AutomotivePartsImageUpload;

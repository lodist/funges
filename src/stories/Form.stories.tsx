import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

// Validation schemas
const basicFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
});

const advancedFormSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email'),
  phone: z.string().optional(),
  age: z.number().min(18, 'You must be at least 18 years old'),
  gender: z.enum(['male', 'female', 'other']),
  interests: z.array(z.string()).min(1, 'Please select at least one interest'),
  newsletter: z.boolean(),
  notifications: z.boolean(),
  bio: z.string().max(500, 'Bio must be less than 500 characters'),
});

const meta: Meta<typeof Form> = {
  title: 'UI/Form',
  component: Form,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A comprehensive form system built with React Hook Form and Zod validation. Provides accessible form controls with proper error handling.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Basic Form Example
export const BasicForm: Story = {
  render: () => {
    const form = useForm<z.infer<typeof basicFormSchema>>({
      resolver: zodResolver(basicFormSchema),
      defaultValues: {
        name: '',
        email: '',
        message: '',
      },
    });

    function onSubmit(values: z.infer<typeof basicFormSchema>) {
      alert(JSON.stringify(values, null, 2));
    }

    return (
      <Card className='w-[400px]'>
        <CardHeader>
          <CardTitle>{'Contact Form'}</CardTitle>
          <CardDescription>
            {"Send us a message and we'll get back to you as soon as possible."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{'Name'}</FormLabel>
                    <FormControl>
                      <Input placeholder='Enter your name' {...field} />
                    </FormControl>
                    <FormDescription>
                      {'Your full name as it appears on your ID.'}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='email'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{'Email'}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Enter your email'
                        type='email'
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {"We'll use this to get back to you."}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='message'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{'Message'}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder='Enter your message'
                        className='resize-none'
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {"Tell us what you'd like to discuss."}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type='submit' className='w-full'>
                {'Send Message'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'A basic contact form with name, email, and message fields with validation.',
      },
    },
  },
};

// Advanced Form Example
export const AdvancedForm: Story = {
  render: () => {
    const form = useForm<z.infer<typeof advancedFormSchema>>({
      resolver: zodResolver(advancedFormSchema),
      defaultValues: {
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        age: 18,
        gender: 'other',
        interests: [],
        newsletter: false,
        notifications: true,
        bio: '',
      },
    });

    function onSubmit(values: z.infer<typeof advancedFormSchema>) {
      alert(JSON.stringify(values, null, 2));
    }

    return (
      <Card className='w-[500px]'>
        <CardHeader>
          <CardTitle>{'User Profile'}</CardTitle>
          <CardDescription>
            {'Complete your profile information below.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
              <div className='grid grid-cols-2 gap-4'>
                <FormField
                  control={form.control}
                  name='firstName'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{'First Name'}</FormLabel>
                      <FormControl>
                        <Input placeholder='John' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='lastName'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{'Last Name'} </FormLabel>
                      <FormControl>
                        <Input placeholder='Doe' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name='email'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{'Email'}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='john@example.com'
                        type='email'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='phone'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{'Phone (Optional)'}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='+1 (555) 123-4567'
                        type='tel'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='age'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{'Age'}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        placeholder='25'
                        {...field}
                        onChange={e =>
                          field.onChange(parseInt(e.target.value) || 0)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='gender'
                render={({ field }) => (
                  <FormItem className='space-y-3'>
                    <FormLabel>{'Gender'}</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className='flex flex-col space-y-1'
                      >
                        <FormItem className='flex items-center space-x-3 space-y-0'>
                          <FormControl>
                            <RadioGroupItem value='male' />
                          </FormControl>
                          <FormLabel className='font-normal'>
                            {'Male'}
                          </FormLabel>
                        </FormItem>
                        <FormItem className='flex items-center space-x-3 space-y-0'>
                          <FormControl>
                            <RadioGroupItem value='female' />
                          </FormControl>
                          <FormLabel className='font-normal'>
                            {'Female'}
                          </FormLabel>
                        </FormItem>
                        <FormItem className='flex items-center space-x-3 space-y-0'>
                          <FormControl>
                            <RadioGroupItem value='other' />
                          </FormControl>
                          <FormLabel className='font-normal'>
                            {'Other'}
                          </FormLabel>
                        </FormItem>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='interests'
                render={() => (
                  <FormItem>
                    <div className='mb-4'>
                      <FormLabel className='text-base'>{'Interests'}</FormLabel>
                      <FormDescription>
                        {'Select the topics that interest you.'}
                      </FormDescription>
                    </div>
                    {[
                      'Technology',
                      'Design',
                      'Marketing',
                      'Business',
                      'Science',
                    ].map(item => (
                      <FormField
                        key={item}
                        control={form.control}
                        name='interests'
                        render={({ field }) => {
                          return (
                            <FormItem
                              key={item}
                              className='flex flex-row items-start space-x-3 space-y-0'
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(item)}
                                  onCheckedChange={checked => {
                                    return checked
                                      ? field.onChange([...field.value, item])
                                      : field.onChange(
                                          field.value?.filter(
                                            value => value !== item
                                          )
                                        );
                                  }}
                                />
                              </FormControl>
                              <FormLabel className='font-normal'>
                                {item}
                              </FormLabel>
                            </FormItem>
                          );
                        }}
                      />
                    ))}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='bio'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{'Bio'}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder='Tell us a little bit about yourself...'
                        className='resize-none'
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {'You can @mention other users and organizations.'}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className='space-y-4'>
                <FormField
                  control={form.control}
                  name='newsletter'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                      <div className='space-y-0.5'>
                        <FormLabel className='text-base'>
                          {'Email Newsletter'}
                        </FormLabel>
                        <FormDescription>
                          {
                            'Receive emails about new products, features, and more.'
                          }
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='notifications'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
                      <div className='space-y-0.5'>
                        <FormLabel className='text-base'>
                          {'Push Notifications'}
                        </FormLabel>
                        <FormDescription>
                          {'Receive push notifications for important updates.'}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <Button type='submit' className='w-full'>
                {'Update Profile'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'A comprehensive user profile form with various input types and validation.',
      },
    },
  },
};

// Form with Select
export const FormWithSelect: Story = {
  render: () => {
    const form = useForm({
      defaultValues: {
        country: '',
        language: '',
        timezone: '',
      },
    });

    function onSubmit(values: Record<string, unknown>) {
      alert(JSON.stringify(values, null, 2));
    }

    return (
      <Card className='w-[400px]'>
        <CardHeader>
          <CardTitle>{'Preferences'}</CardTitle>
          <CardDescription>
            {'Configure your account preferences.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
              <FormField
                control={form.control}
                name='country'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{'Country'}</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select a country' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='us'>{'United States'}</SelectItem>
                        <SelectItem value='ca'>{'Canada'}</SelectItem>
                        <SelectItem value='uk'>{'United Kingdom'}</SelectItem>
                        <SelectItem value='au'>{'Australia'}</SelectItem>
                        <SelectItem value='de'>{'Germany'}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='language'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{'Language'}</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select a language' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='en'>{'English'}</SelectItem>
                        <SelectItem value='es'>{'Spanish'}</SelectItem>
                        <SelectItem value='fr'>{'French'}</SelectItem>
                        <SelectItem value='de'>{'German'}</SelectItem>
                        <SelectItem value='it'>{'Italian'}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='timezone'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{'Timezone'}</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select a timezone' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='utc'>{'UTC'}</SelectItem>
                        <SelectItem value='est'>{'Eastern Time'}</SelectItem>
                        <SelectItem value='cst'>{'Central Time'}</SelectItem>
                        <SelectItem value='mst'>{'Mountain Time'}</SelectItem>
                        <SelectItem value='pst'>{'Pacific Time'}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type='submit' className='w-full'>
                {'Save Preferences'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Form with select dropdowns for preferences configuration.',
      },
    },
  },
};

// Form with Validation Errors
export const FormWithErrors: Story = {
  render: () => {
    const form = useForm({
      defaultValues: {
        email: 'invalid-email',
        password: '123',
        confirmPassword: '456',
      },
    });

    function onSubmit(values: Record<string, unknown>) {
      alert(JSON.stringify(values, null, 2));
    }

    // Simulate validation errors
    React.useEffect(() => {
      form.setError('email', { message: 'Please enter a valid email address' });
      form.setError('password', {
        message: 'Password must be at least 8 characters',
      });
      form.setError('confirmPassword', { message: 'Passwords do not match' });
    }, [form]);

    return (
      <Card className='w-[400px]'>
        <CardHeader>
          <CardTitle>{'Registration'}</CardTitle>
          <CardDescription>
            {'Create your account (with validation errors).'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
              <FormField
                control={form.control}
                name='email'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{'Email'}</FormLabel>
                    <FormControl>
                      <Input placeholder='Enter your email' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='password'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{'Password'}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Enter your password'
                        type='password'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='confirmPassword'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{'Confirm Password'}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='Confirm your password'
                        type='password'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type='submit' className='w-full'>
                {'Create Account'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Form demonstrating error states and validation messages.',
      },
    },
  },
};

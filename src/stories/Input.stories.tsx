import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from '@/components/ui/input';
import { Search as SearchIcon, Mail, Lock, User } from 'lucide-react';

const meta: Meta<typeof Input> = {
  title: 'UI/Input',
  component: Input,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A flexible input component with built-in styling and accessibility features. Supports all standard HTML input types and attributes.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: { type: 'select' },
      options: [
        'text',
        'email',
        'password',
        'number',
        'tel',
        'url',
        'search',
        'file',
        'date',
        'time',
        'datetime-local',
        'month',
        'week',
      ],
      description: 'The type of input field',
    },
    placeholder: {
      control: { type: 'text' },
      description: 'Placeholder text for the input',
    },
    disabled: {
      control: { type: 'boolean' },
      description: 'Whether the input is disabled',
    },
    required: {
      control: { type: 'boolean' },
      description: 'Whether the input is required',
    },
    'aria-invalid': {
      control: { type: 'select' },
      options: ['true', 'false'],
      description: 'Accessibility attribute for invalid state',
    },
  },
  args: {
    placeholder: 'Enter text...',
    disabled: false,
    required: false,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// Basic Examples
export const Default: Story = {
  args: {
    placeholder: 'Enter your text here...',
  },
};

export const WithValue: Story = {
  args: {
    value: 'Hello World',
    placeholder: 'Enter your text here...',
  },
};

// Input Types
export const Email: Story = {
  args: {
    type: 'email',
    placeholder: 'Enter your email...',
  },
};

export const Password: Story = {
  args: {
    type: 'password',
    placeholder: 'Enter your password...',
  },
};

export const Number: Story = {
  args: {
    type: 'number',
    placeholder: 'Enter a number...',
    min: 0,
    max: 100,
  },
};

export const Search: Story = {
  args: {
    type: 'search',
    placeholder: 'Search...',
  },
};

export const Tel: Story = {
  args: {
    type: 'tel',
    placeholder: 'Enter phone number...',
  },
};

export const Url: Story = {
  args: {
    type: 'url',
    placeholder: 'Enter URL...',
  },
};

export const Date: Story = {
  args: {
    type: 'date',
  },
};

export const Time: Story = {
  args: {
    type: 'time',
  },
};

export const File: Story = {
  args: {
    type: 'file',
    accept: '.pdf,.doc,.docx',
  },
};

// States
export const Disabled: Story = {
  args: {
    disabled: true,
    placeholder: 'This input is disabled',
  },
};

export const Required: Story = {
  args: {
    required: true,
    placeholder: 'This field is required',
  },
};

export const Invalid: Story = {
  args: {
    'aria-invalid': 'true',
    placeholder: 'Invalid input',
    value: 'invalid@email',
  },
};

// With Icons (using wrapper divs)
export const WithLeadingIcon: Story = {
  render: () => (
    <div className='relative'>
      <SearchIcon className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
      <Input className='pl-10' placeholder='Search...' type='search' />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Input with a leading search icon.',
      },
    },
  },
};

export const WithTrailingIcon: Story = {
  render: () => (
    <div className='relative'>
      <Input className='pr-10' placeholder='Enter email...' type='email' />
      <Mail className='absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Input with a trailing email icon.',
      },
    },
  },
};

export const WithBothIcons: Story = {
  render: () => (
    <div className='relative'>
      <User className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
      <Input className='px-10' placeholder='Enter username...' />
      <Lock className='absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Input with both leading and trailing icons.',
      },
    },
  },
};

// Sizes and Layout
export const FullWidth: Story = {
  render: () => (
    <div className='w-full max-w-md'>
      <Input placeholder='Full width input' />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Input that takes full width of its container.',
      },
    },
  },
};

export const InForm: Story = {
  render: () => (
    <div className='space-y-4 w-full max-w-md'>
      <div>
        <label htmlFor='name' className='block text-sm font-medium mb-2'>
          {'Name'}
        </label>
        <Input id='name' placeholder='Enter your name' />
      </div>
      <div>
        <label htmlFor='email' className='block text-sm font-medium mb-2'>
          {'Email'}
        </label>
        <Input id='email' type='email' placeholder='Enter your email' />
      </div>
      <div>
        <label htmlFor='password' className='block text-sm font-medium mb-2'>
          {'Password'}
        </label>
        <Input
          id='password'
          type='password'
          placeholder='Enter your password'
        />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Multiple inputs in a form layout with labels.',
      },
    },
  },
};

// Interactive Examples
export const Controlled: Story = {
  render: () => {
    const [value, setValue] = React.useState('');
    return (
      <div className='space-y-2'>
        <Input
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder='Type something...'
        />
        <p className='text-sm text-muted-foreground'>
          {'Current value: '}
          {value || '(empty)'}
        </p>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Controlled input with state management.',
      },
    },
  },
};

export const WithValidation: Story = {
  render: () => {
    const [email, setEmail] = React.useState('');
    const [isValid, setIsValid] = React.useState(true);

    const validateEmail = (value: string) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(value);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setEmail(value);
      if (value && !validateEmail(value)) {
        setIsValid(false);
      } else {
        setIsValid(true);
      }
    };

    return (
      <div className='space-y-2'>
        <Input
          type='email'
          value={email}
          onChange={handleChange}
          placeholder='Enter email...'
          aria-invalid={!isValid}
          className={!isValid ? 'border-red-500' : ''}
        />
        {!isValid && email && (
          <p className='text-sm text-red-500'>
            {'Please enter a valid email address'}
          </p>
        )}
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Input with real-time email validation.',
      },
    },
  },
};

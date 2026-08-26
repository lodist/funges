import React from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Input } from '@/components/ui/input';
import { Search as SearchIcon, Mail, Lock, User } from 'lucide-react';

const meta: Meta<typeof Input> = {
  title: 'Atoms/Input',
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
          className={!isValid ? 'border-destructive' : ''}
        />
        {!isValid && email && (
          <p className='text-sm text-destructive'>
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

// Brand typefaces
export const Typefaces: Story = {
  render: () => (
    <div className='space-y-3'>
      <Input className='font-sans' placeholder='Montserrat (font-sans)' />
      <Input className='font-serif' placeholder='Merriweather (font-serif)' />
      <Input className='font-mono' placeholder='Source Code Pro (font-mono)' />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Confirms the self-hosted @fontsource files actually load for each of the three brand typefaces.',
      },
    },
  },
};

/**
 * The matrix the per-atom bar asks for: every type and every state the input
 * is rendered in, side by side. Input has no `variant` prop — `type` and the
 * validation/disabled states are what vary.
 */
export const AllTypesAndStates: Story = {
  render: () => (
    <div className='grid w-full max-w-4xl grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2'>
      {[
        { label: 'text', props: { type: 'text', placeholder: 'Plain text' } },
        {
          label: 'email',
          props: { type: 'email', placeholder: 'you@example.com' },
        },
        {
          label: 'password',
          props: { type: 'password', defaultValue: 'secret' },
        },
        { label: 'number', props: { type: 'number', defaultValue: 42 } },
        { label: 'search', props: { type: 'search', placeholder: 'Search' } },
        {
          label: 'tel',
          props: { type: 'tel', placeholder: '+39 000 000 0000' },
        },
        { label: 'url', props: { type: 'url', placeholder: 'https://' } },
        { label: 'date', props: { type: 'date' } },
        { label: 'time', props: { type: 'time' } },
        { label: 'file', props: { type: 'file' } },
        { label: 'with value', props: { defaultValue: 'Chanterelle' } },
        {
          label: 'disabled',
          props: { disabled: true, defaultValue: 'Locked' },
        },
        {
          label: 'read-only',
          props: { readOnly: true, defaultValue: 'Not editable' },
        },
        {
          label: 'required',
          props: { required: true, placeholder: 'Required' },
        },
        {
          label: 'invalid',
          props: { 'aria-invalid': true, defaultValue: 'Bad value' },
        },
      ].map(state => (
        <div key={state.label} className='flex flex-col gap-1'>
          <p className='text-muted-foreground font-mono text-xs'>
            {state.label}
          </p>
          <Input aria-label={state.label} {...state.props} />
        </div>
      ))}
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'Every input type and state in one view. Note that `type` changes the native control the browser renders, so date, time and file look markedly different from the rest and are not stylable to match.',
      },
    },
  },
};

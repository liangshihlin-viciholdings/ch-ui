import { useId } from "react";

interface LogoProps {
	className?: string;
	size?: number;
}

export function Logo({ className = "", size = 32 }: LogoProps) {
	// Unique IDs for gradients to avoid conflicts when multiple logos render
	const id = useId();
	const gradientId = `logo-gradient-${id}`;
	const gradientLightId = `logo-gradient-light-${id}`;

	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 32 32"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
		>
			<defs>
				{/* Uses CSS variables from current theme */}
				<linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
					<stop offset="0%" className="[stop-color:hsl(var(--primary))]" />
					<stop offset="100%" className="[stop-color:hsl(var(--accent))]" />
				</linearGradient>
				<linearGradient id={gradientLightId} x1="0%" y1="100%" x2="100%" y2="0%">
					<stop offset="0%" className="[stop-color:hsl(var(--primary))]" />
					<stop offset="100%" className="[stop-color:hsl(var(--primary)/0.7)]" />
				</linearGradient>
			</defs>
			{/* Database cylinder shape */}
			<ellipse cx="16" cy="8" rx="12" ry="4" fill={`url(#${gradientLightId})`} />
			<path
				d="M4 8v16c0 2.2 5.4 4 12 4s12-1.8 12-4V8"
				stroke={`url(#${gradientId})`}
				strokeWidth="2"
				fill="none"
			/>
			<ellipse
				cx="16"
				cy="24"
				rx="12"
				ry="4"
				fill={`url(#${gradientId})`}
				fillOpacity="0.3"
			/>
			{/* Data bars / analytics lines */}
			<rect x="10" y="12" width="3" height="8" rx="1" fill={`url(#${gradientId})`} />
			<rect x="14.5" y="10" width="3" height="10" rx="1" fill={`url(#${gradientLightId})`} />
			<rect x="19" y="13" width="3" height="7" rx="1" fill={`url(#${gradientId})`} />
		</svg>
	);
}

export default Logo;
